"""Generate images using nano-banana-pro via Poe API or Gemini API."""
import os
import base64
import re
import requests
from pathlib import Path
from io import BytesIO
from PIL import Image
import openai
from dotenv import load_dotenv

# Load environment
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

# Try to use secrets manager, fallback to os.getenv
try:
    from shared.components.secret_manager import SecretsManager
    secrets = SecretsManager([
        Path(__file__).parent / ".env",
        Path(__file__).parent.parent.parent / "shared/creds/.env"
    ])
except ImportError:
    secrets = None
    print("[Warning] SecretsManager not available, using os.getenv()")


# Custom exceptions for provider error handling
class ProviderError(Exception):
    """Base exception for provider errors."""
    pass


class FatalProviderError(ProviderError):
    """Fatal error - trigger immediate fallback."""
    pass


class RetryableProviderError(ProviderError):
    """Retryable error - already exhausted retries."""
    pass


# Provider options
PROVIDER_POE = "poe"
PROVIDER_GEMINI = "gemini"
PROVIDER_GEMINI_PRO = "gemini-pro"
PROVIDER_GROK2 = "grok-2"

# Default provider: POE nano-banana-pro
DEFAULT_PROVIDER = PROVIDER_POE

# POE model
IMAGE_MODEL = "nano-banana-pro"

# Current provider (can be changed at runtime)
_current_provider = DEFAULT_PROVIDER

# Default fallback provider: Grok-2
DEFAULT_FALLBACK = PROVIDER_GROK2

# Configurable fallback provider (user can override)
_fallback_provider = DEFAULT_FALLBACK

# Face similarity settings
FACE_SIMILARITY_THRESHOLD = 0.85  # 85% minimum
FACE_VALIDATION_MAX_RETRIES = 3
_face_validation_enabled = False  # Toggleable feature


def enable_face_validation(enabled: bool = True):
    """Enable or disable face validation."""
    global _face_validation_enabled
    _face_validation_enabled = enabled
    print(f"[Face Validation] {'Enabled' if enabled else 'Disabled'}")


def is_face_validation_enabled() -> bool:
    """Check if face validation is enabled."""
    return _face_validation_enabled


def set_face_threshold(threshold: float):
    """Set face similarity threshold (0.0-1.0)."""
    global FACE_SIMILARITY_THRESHOLD
    FACE_SIMILARITY_THRESHOLD = max(0.0, min(1.0, threshold))
    print(f"[Face Validation] Threshold set to: {FACE_SIMILARITY_THRESHOLD:.1%}")


def set_face_max_retries(retries: int):
    """Set maximum face validation retries."""
    global FACE_VALIDATION_MAX_RETRIES
    FACE_VALIDATION_MAX_RETRIES = max(1, retries)
    print(f"[Face Validation] Max retries set to: {FACE_VALIDATION_MAX_RETRIES}")


def set_provider(provider: str):
    """Set the current image generation provider."""
    global _current_provider
    if provider not in [PROVIDER_POE, PROVIDER_GEMINI, PROVIDER_GEMINI_PRO, PROVIDER_GROK2]:
        raise ValueError(f"Unknown provider: {provider}. Use 'poe', 'gemini', 'gemini-pro', or 'grok-2'")
    _current_provider = provider
    print(f"[Provider] Set to: {provider}")


def get_provider() -> str:
    """Get the current image generation provider."""
    return _current_provider


def set_fallback_provider(provider: str):
    """Set the fallback provider for image generation.

    Args:
        provider: One of 'poe', 'gemini', 'gemini-pro', 'grok-2'
    """
    global _fallback_provider
    if provider not in [PROVIDER_POE, PROVIDER_GEMINI, PROVIDER_GEMINI_PRO, PROVIDER_GROK2]:
        raise ValueError(f"Unknown provider: {provider}. Use 'poe', 'gemini', 'gemini-pro', or 'grok-2'")
    _fallback_provider = provider
    print(f"[Fallback Provider] Set to: {provider}")


def get_fallback_provider() -> str:
    """Get the current fallback provider."""
    return _fallback_provider


def get_available_providers() -> list:
    """Get list of available providers with descriptions."""
    return [
        (PROVIDER_POE, "POE (nano-banana-pro)"),
        (PROVIDER_GROK2, "Grok-2 Image (xAI) - text prompts only"),
        (PROVIDER_GEMINI, "Gemini 2.5 Flash Image"),
        (PROVIDER_GEMINI_PRO, "Gemini 3 Pro Image Preview"),
    ]


def image_to_base64(image_path: str) -> str:
    """Convert image file to base64 string."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def pil_to_base64(img: Image.Image, format: str = "PNG") -> str:
    """Convert PIL Image to base64 string."""
    buffer = BytesIO()
    img.save(buffer, format=format)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def base64_to_pil(b64_string: str) -> Image.Image:
    """Convert base64 string to PIL Image."""
    img_data = base64.b64decode(b64_string)
    return Image.open(BytesIO(img_data))


def get_image_mime_type(image_path: str) -> str:
    """Get MIME type from image path."""
    ext = Path(image_path).suffix.lower()
    mime_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    return mime_types.get(ext, "image/jpeg")


def generate_image_with_fallback(
    prompt: str,
    input_image_path: str = None,
    input_image_pil: Image.Image = None,
    context_images: list = None,
    on_chunk: callable = None,
    provider: str = None,
) -> tuple:
    """
    Generate image with automatic fallback to alternative providers.

    Args:
        prompt: Text prompt
        input_image_path: Path to input image
        input_image_pil: PIL Image input
        context_images: List of PIL Images for context
        on_chunk: Progress callback
        provider: Specific provider to use (locks to this provider, no fallback)

    Returns:
        tuple: (generated_image, provider_used)
    """
    # Determine primary provider
    primary_provider = provider or _current_provider

    # If provider is explicitly locked, don't fallback
    use_fallback = (provider is None)

    # Determine if we have context images that require img2img
    has_context = bool(context_images or input_image_pil or input_image_path)

    # Try primary provider
    try:
        result = generate_image_streaming(
            prompt=prompt,
            input_image_path=input_image_path,
            input_image_pil=input_image_pil,
            context_images=context_images,
            on_chunk=on_chunk,
            provider=primary_provider,
        )
        return (result, primary_provider)

    except FatalProviderError as e:
        # Fatal error - trigger immediate fallback
        if not use_fallback:
            raise  # Provider locked, no fallback allowed
        if on_chunk:
            on_chunk(f"\n[{primary_provider} fatal error: {e}. Trying fallback...]\n")

    except RetryableProviderError as e:
        # Retryable error - already exhausted retries
        if not use_fallback:
            raise  # Provider locked, no fallback allowed
        if on_chunk:
            on_chunk(f"\n[{primary_provider} failed after retries. Trying fallback...]\n")

    # Try configured fallback provider
    fallback = _fallback_provider

    # Skip fallback if same as primary
    if fallback == primary_provider:
        raise RuntimeError(f"Primary provider {primary_provider} failed and fallback is same provider")

    # For Grok-2 fallback with context images: use text-only (it doesn't support img2img)
    fallback_context = context_images
    fallback_input_path = input_image_path
    fallback_input_pil = input_image_pil
    if fallback == PROVIDER_GROK2 and has_context:
        if on_chunk:
            on_chunk(f"\n[Note: {fallback} doesn't support context images, using text-only prompt]\n")
        fallback_context = None
        fallback_input_path = None
        fallback_input_pil = None

    try:
        if on_chunk:
            on_chunk(f"\n[Trying fallback provider: {fallback}...]\n")

        result = generate_image_streaming(
            prompt=prompt,
            input_image_path=fallback_input_path,
            input_image_pil=fallback_input_pil,
            context_images=fallback_context,
            on_chunk=on_chunk,
            provider=fallback,
        )
        if on_chunk:
            on_chunk(f"\n[Fallback successful: {fallback}]\n")
        return (result, fallback)

    except Exception as e:
        if on_chunk:
            on_chunk(f"\n[{fallback} also failed: {e}]\n")
        raise RuntimeError(f"All providers failed. Primary: {primary_provider}, Fallback: {fallback}")


def generate_image_with_face_validation(
    prompt: str,
    previous_image: Image.Image = None,
    context_images: list = None,
    on_chunk: callable = None,
    provider: str = None,
) -> tuple:
    """
    Generate image with face similarity validation and retry.

    Args:
        prompt: Text prompt
        previous_image: Previous image to compare face with (for similarity)
        context_images: List of PIL Images for context
        on_chunk: Progress callback
        provider: Lock to specific provider for all retries

    Returns:
        tuple: (generated_image, provider_used, similarity_score)
    """
    # Import face_similarity here to handle import errors gracefully
    try:
        from face_similarity import calculate_similarity, FACE_RECOGNITION_AVAILABLE
    except ImportError:
        raise RuntimeError("Face validation enabled but face_recognition not installed. Install with: pip install face-recognition")

    if not FACE_RECOGNITION_AVAILABLE:
        raise RuntimeError("Face validation enabled but face_recognition not installed. Install with: pip install face-recognition")

    # If no previous image, skip validation (first image in sequence)
    if previous_image is None:
        img, provider_used = generate_image_with_fallback(
            prompt=prompt,
            context_images=context_images,
            on_chunk=on_chunk,
            provider=provider,
        )
        return (img, provider_used, None)

    # Try up to max_retries times with face validation
    best_image = None
    best_similarity = 0.0
    best_provider = None
    no_face_attempts = 0

    for attempt in range(FACE_VALIDATION_MAX_RETRIES):
        # Generate image (locked to same provider across retries)
        img, provider_used = generate_image_with_fallback(
            prompt=prompt,
            context_images=context_images,
            on_chunk=on_chunk,
            provider=provider or best_provider,  # Lock to provider after first attempt
        )

        # Store provider from first successful generation
        if best_provider is None:
            best_provider = provider_used

        # Calculate face similarity
        similarity = calculate_similarity(previous_image, img)

        if similarity is None:
            # No face detected - count as failed attempt and retry
            no_face_attempts += 1
            if on_chunk:
                on_chunk(f"\n[ERROR: No face detected in generated image (attempt {attempt+1}/{FACE_VALIDATION_MAX_RETRIES})]")
            
            if attempt < FACE_VALIDATION_MAX_RETRIES - 1:
                if on_chunk:
                    on_chunk(f" Retrying...\n")
                # Enhance prompt to ensure face is visible
                prompt = f"{prompt}. IMPORTANT: The character's face MUST be clearly visible in the image. Show the face prominently."
                continue
            else:
                # All attempts failed to detect face
                if on_chunk:
                    on_chunk(f"\n[FAILED: Could not detect face after {FACE_VALIDATION_MAX_RETRIES} attempts]\n")
                raise RuntimeError(f"Face validation failed: No face detected after {FACE_VALIDATION_MAX_RETRIES} attempts")

        if on_chunk:
            on_chunk(f"\n[Face similarity: {similarity:.1%}]")

        # Track best attempt
        if similarity > best_similarity:
            best_image = img
            best_similarity = similarity

        # Check if meets threshold
        if similarity >= FACE_SIMILARITY_THRESHOLD:
            if on_chunk:
                on_chunk(f" ✓ Meets threshold ({FACE_SIMILARITY_THRESHOLD:.1%})\n")
            return (img, provider_used, similarity)

        # Below threshold - retry with enhanced prompt
        if attempt < FACE_VALIDATION_MAX_RETRIES - 1:
            if on_chunk:
                on_chunk(f" ✗ Below threshold ({FACE_SIMILARITY_THRESHOLD:.1%}), retrying with enhanced prompt (attempt {attempt+2}/{FACE_VALIDATION_MAX_RETRIES})...\n")

            # Enhance prompt with face consistency instructions
            prompt = f"{prompt}. CRITICAL: Maintain the EXACT SAME character face and facial features as the previous image. Keep facial structure, expression style, age, gender, and character identity perfectly consistent."
        else:
            # Final attempt failed - use best attempt
            if on_chunk:
                on_chunk(f" ✗ Below threshold. Max retries reached. Using best attempt ({best_similarity:.1%})\n")
            return (best_image, best_provider, best_similarity)

    # Should never reach here, but return best attempt
    return (best_image, best_provider, best_similarity)


def generate_image_streaming(
    prompt: str,
    input_image_path: str = None,
    input_image_pil: Image.Image = None,
    context_images: list = None,
    on_chunk: callable = None,
    provider: str = None,
) -> Image.Image:
    """
    Generate an image using the selected provider with streaming response.
    
    Args:
        prompt: Text prompt for image generation
        input_image_path: Path to input image (for img2img)
        input_image_pil: PIL Image as input (alternative to path)
        context_images: List of PIL Images to include as context (all previous images)
        on_chunk: Callback(text) for each streamed chunk
        provider: Override the current provider (optional)
        
    Returns:
        Generated PIL Image or None if text-only response
    """
    # Determine which provider to use
    use_provider = provider or _current_provider
    
    # If input is a path, load it as PIL
    if input_image_path and not input_image_pil:
        input_image_pil = Image.open(input_image_path)
        input_image_pil.load()
    
    # Build list of all images (context + current input)
    all_images = []
    if context_images:
        all_images.extend(context_images)
    if input_image_pil and input_image_pil not in all_images:
        all_images.append(input_image_pil)
    
    # Route to appropriate provider
    if use_provider == PROVIDER_GEMINI:
        from gemini_generator import generate_image_gemini
        return generate_image_gemini(
            prompt=prompt,
            input_images=all_images if all_images else None,
            on_chunk=on_chunk,
            model="gemini-2.5-flash-image",
        )
    elif use_provider == PROVIDER_GEMINI_PRO:
        from gemini_generator import generate_image_gemini
        return generate_image_gemini(
            prompt=prompt,
            input_images=all_images if all_images else None,
            on_chunk=on_chunk,
            model="gemini-3-pro-image-preview",
        )
    elif use_provider == PROVIDER_GROK2:
        from grok_generator import generate_image_grok2
        # Grok-2 doesn't support context images - text only
        if all_images:
            if on_chunk:
                on_chunk("[Warning: Grok-2 doesn't support context images, using text-only]\n")
        return generate_image_grok2(prompt=prompt, on_chunk=on_chunk)
    else:
        # Default to POE
        return _generate_image_poe(
            prompt=prompt,
            input_images=all_images if all_images else None,
            on_chunk=on_chunk,
        )


def _generate_image_poe(
    prompt: str,
    input_images: list = None,
    on_chunk: callable = None,
) -> Image.Image:
    """
    Generate an image using nano-banana-pro via POE with streaming response.
    
    Args:
        prompt: Text prompt for image generation
        input_images: List of PIL Images as context
        on_chunk: Callback(text) for each streamed chunk
        
    Returns:
        Generated PIL Image or None if text-only response
    """
    api_key = secrets.get_secret("POE_KEY") if secrets else os.getenv("POE_KEY")
    if not api_key:
        raise ValueError("POE_KEY not found in environment")
    
    client = openai.OpenAI(
        api_key=api_key,
        base_url="https://api.poe.com/v1",
    )
    
    # Build message content
    content = []
    
    # Add all input images
    if input_images:
        print(f"[POE] Including {len(input_images)} context images")
        for i, img in enumerate(input_images):
            img_b64 = pil_to_base64(img)
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{img_b64}"
                }
            })
    
    # Add text prompt
    content.append({
        "type": "text",
        "text": prompt
    })
    
    messages = [{
        "role": "user",
        "content": content
    }]
    
    # Outer retry loop for text-only responses (model sometimes returns text without image)
    text_only_max_retries = 3
    for text_only_attempt in range(text_only_max_retries):
        # Stream the response with retry logic for API errors
        max_retries = 2
        result = None
        for attempt in range(max_retries + 1):
            try:
                retry_info = f"text-only retry {text_only_attempt + 1}/{text_only_max_retries}, " if text_only_attempt > 0 else ""
                print(f"\n[{IMAGE_MODEL} Streaming Response] ({retry_info}attempt {attempt + 1})")
                stream = client.chat.completions.create(
                    model=IMAGE_MODEL,
                    messages=messages,
                    stream=True,
                )

                result = ""
                for chunk in stream:
                    if chunk.choices and chunk.choices[0].delta.content:
                        chunk_text = chunk.choices[0].delta.content
                        print(chunk_text, end="", flush=True)
                        result += chunk_text
                        if on_chunk:
                            on_chunk(chunk_text)
                print("\n[Stream complete]")
                break  # Success, exit API retry loop
            except openai.AuthenticationError as e:
                # Fatal - don't retry, trigger immediate fallback
                print(f"\n[Authentication error: {e}]")
                raise FatalProviderError(f"Authentication failed: {e}") from e
            except openai.RateLimitError as e:
                # Retryable - exhaust retries before fallback
                print(f"\n[Rate limit error: {e}]")
                if attempt < max_retries:
                    print(f"Retrying... ({attempt + 2}/{max_retries + 1})")
                    if on_chunk:
                        on_chunk(f"\n[Rate limit, retrying...]\n")
                else:
                    raise RetryableProviderError(f"Rate limit after {max_retries + 1} retries: {e}") from e
            except openai.APITimeoutError as e:
                # Retryable
                print(f"\n[Timeout error: {e}]")
                if attempt < max_retries:
                    print(f"Retrying... ({attempt + 2}/{max_retries + 1})")
                    if on_chunk:
                        on_chunk(f"\n[Timeout, retrying...]\n")
                else:
                    raise RetryableProviderError(f"Timeout after {max_retries + 1} retries: {e}") from e
            except Exception as e:
                # Unknown - treat as retryable
                print(f"\n[Stream error: {e}]")
                if attempt < max_retries:
                    print(f"Retrying... ({attempt + 2}/{max_retries + 1})")
                    if on_chunk:
                        on_chunk(f"\n[Connection error, retrying...]\n")
                else:
                    raise RetryableProviderError(f"Error after {max_retries + 1} retries: {e}") from e

        # If API failed completely, result will be None - raise to trigger fallback
        if result is None:
            raise RetryableProviderError("POE API request failed - no response received")

        # Check if result contains an image URL (poecdn URLs may have query params)
        # Match poecdn URLs or standard image URLs
        url_patterns = [
            r'(https?://[^\s\)\]"\'<>]+poecdn\.net/[^\s\)\]"\'<>]+)',  # poecdn URLs
            r'(https?://[^\s\)\]"\'<>]+\.(png|jpg|jpeg|webp|gif)(\?[^\s\)\]"\'<>]*)?)',  # standard image URLs
        ]

        url = None
        for pattern in url_patterns:
            url_match = re.search(pattern, result, re.IGNORECASE)
            if url_match:
                url = url_match.group(1)
                # Clean up any trailing characters
                url = url.rstrip('.,;:!?')
                break

        print(f"DEBUG: Extracted URL = '{url}'")

        if url:
            print(f"Found image URL: {url}")
            if on_chunk:
                on_chunk(f"\n\n[Downloading image...]")
            try:
                img_response = requests.get(url, timeout=30)
                img_response.raise_for_status()
                # Load image fully into memory (PIL lazy-loads by default)
                img = Image.open(BytesIO(img_response.content))
                img.load()  # Force load the image data
                if on_chunk:
                    on_chunk(f" Done!")
                return img
            except requests.Timeout:
                print(f"Timeout downloading image")
                if on_chunk:
                    on_chunk(f"\n[Timeout - download took too long]")
            except Exception as e:
                print(f"Failed to download image: {e}")
                if on_chunk:
                    on_chunk(f"\n[Failed to download: {e}]")

        # Check for base64 data URL
        if "base64," in result:
            print(f"Decoding base64 data URL...")
            if on_chunk:
                on_chunk("\n\n[Decoding base64 image]")
            b64_data = result.split("base64,")[1].split('"')[0].split("'")[0].split(")")[0]
            img = base64_to_pil(b64_data)
            img.load()  # Force load
            return img

        # Try to decode as raw base64
        try:
            print(f"Trying to decode as raw base64...")
            img = base64_to_pil(result.strip())
            img.load()  # Force load
            return img
        except Exception:
            # Model returned text only, no image - retry if attempts remain
            if text_only_attempt < text_only_max_retries - 1:
                print(f"No image in response - retrying ({text_only_attempt + 2}/{text_only_max_retries})")
                if on_chunk:
                    on_chunk(f"\n\n[No image generated - retrying...]")
                continue
            else:
                print(f"No image in response after {text_only_max_retries} attempts - model returned text only")
                if on_chunk:
                    on_chunk(f"\n\n[No image generated after {text_only_max_retries} attempts]")
                raise RetryableProviderError(f"POE returned text only after {text_only_max_retries} attempts")

    # Should not reach here - raise error to trigger fallback
    raise RetryableProviderError("POE generation failed after all retries")


# Keep old function for compatibility
def generate_image(
    prompt: str,
    input_image_path: str = None,
    input_image_pil: Image.Image = None,
) -> Image.Image:
    """Generate image without streaming callback."""
    return generate_image_streaming(prompt, input_image_path, input_image_pil, on_chunk=None)


def generate_sequence(
    prompts: list,
    initial_image_path: str,
    on_progress: callable = None,
) -> list:
    """
    Generate a sequence of images from step prompts.
    
    Args:
        prompts: List of (step_num, prompt_text) tuples
        initial_image_path: Path to IMAGE_0
        on_progress: Callback(step_num, total, image) for progress updates
        
    Returns:
        List of PIL Images [IMAGE_0, IMAGE_1, ...]
    """
    images = [Image.open(initial_image_path)]
    total = len(prompts)
    
    for i, (step_num, prompt) in enumerate(prompts):
        if on_progress:
            on_progress(i + 1, total, None)
        
        # Generate next image using previous image
        new_image = generate_image(
            prompt=prompt,
            input_image_pil=images[-1]
        )
        images.append(new_image)
        
        if on_progress:
            on_progress(i + 1, total, new_image)
    
    return images
