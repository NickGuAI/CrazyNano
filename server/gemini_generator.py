"""Generate images using Gemini API directly."""
import os
import time
from pathlib import Path
from PIL import Image
from dotenv import load_dotenv

# Load environment
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# Available models:
# - gemini-2.5-flash-image: Fast, good quality (aka Nano Banana)
# - gemini-3-pro-image-preview: Best quality, supports up to 14 reference images (aka Nano Banana Pro)
GEMINI_MODEL = "gemini-2.5-flash-image"

# Default retry settings
DEFAULT_MAX_RETRIES = 3
_max_retries = DEFAULT_MAX_RETRIES


def set_max_retries(retries: int):
    """Set the maximum number of retries for Gemini API calls."""
    global _max_retries
    _max_retries = max(1, retries)
    print(f"[Gemini] Max retries set to: {_max_retries}")


def get_max_retries() -> int:
    """Get the current maximum number of retries."""
    return _max_retries


def generate_image_gemini(
    prompt: str,
    input_image_pil: Image.Image = None,
    input_images: list = None,
    on_chunk: callable = None,
    model: str = None,
    max_retries: int = None,
) -> Image.Image:
    """
    Generate an image using Gemini API with retry logic.
    
    Args:
        prompt: Text prompt for image generation
        input_image_pil: PIL Image as input (for img2img) - deprecated, use input_images
        input_images: List of PIL Images as context (supports up to 14 for gemini-3-pro)
        on_chunk: Callback(text) for progress updates
        model: Model to use (default: gemini-2.5-flash-image)
        max_retries: Override default max retries
        
    Returns:
        Generated PIL Image or None if no image generated
    """
    retries = max_retries if max_retries is not None else _max_retries
    last_error = None
    
    for attempt in range(retries):
        try:
            result = _generate_image_gemini_impl(
                prompt=prompt,
                input_image_pil=input_image_pil,
                input_images=input_images,
                on_chunk=on_chunk,
                model=model,
                attempt=attempt + 1,
                max_attempts=retries,
            )
            return result
        except Exception as e:
            last_error = e
            if attempt < retries - 1:
                wait_time = (attempt + 1) * 2  # Exponential backoff: 2s, 4s, 6s...
                print(f"[Gemini] Attempt {attempt + 1}/{retries} failed: {e}")
                print(f"[Gemini] Retrying in {wait_time}s...")
                if on_chunk:
                    on_chunk(f"\n[Attempt {attempt + 1}/{retries} failed, retrying in {wait_time}s...]\n")
                time.sleep(wait_time)
            else:
                print(f"[Gemini] All {retries} attempts failed")
                if on_chunk:
                    on_chunk(f"\n[All {retries} attempts failed: {e}]")
    
    raise last_error


def _generate_image_gemini_impl(
    prompt: str,
    input_image_pil: Image.Image = None,
    input_images: list = None,
    on_chunk: callable = None,
    model: str = None,
    attempt: int = 1,
    max_attempts: int = 1,
) -> Image.Image:
    """
    Internal implementation of Gemini image generation.
    """
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        raise ImportError("Please install google-genai: pip install google-genai")
    
    # Try to use secrets manager, fallback to os.getenv
    try:
        from shared.components.secret_manager import SecretsManager
        from pathlib import Path
        secrets = SecretsManager([
            Path(__file__).parent.parent / ".env",
            Path(__file__).parent.parent.parent.parent / "shared/creds/.env"
        ])
        api_key = secrets.get_secret("GEMINI_API_KEY")
    except (ImportError, Exception):
        api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        raise ValueError("GEMINI_API_KEY not found in environment")
    
    model_name = model or GEMINI_MODEL
    client = genai.Client(api_key=api_key)
    
    # Build contents - images first, then prompt
    contents = []
    
    # Add all input images
    if input_images:
        # Limit based on model (flash: 3, pro: 14)
        max_images = 14 if "pro" in model_name.lower() else 3
        images_to_use = input_images[-max_images:]  # Use most recent images
        print(f"[Gemini] Including {len(images_to_use)} context images (max {max_images} for {model_name})")
        if on_chunk:
            on_chunk(f"[Including {len(images_to_use)} context images]\n")
        for img in images_to_use:
            contents.append(img)
    elif input_image_pil:
        # Backward compatibility
        contents.append(input_image_pil)
    
    # Add text prompt
    contents.append(prompt)
    
    # Build config
    config = types.GenerateContentConfig(
        response_modalities=['TEXT', 'IMAGE'],
    )
    
    attempt_str = f" (attempt {attempt}/{max_attempts})" if max_attempts > 1 else ""
    print(f"\n[Gemini {model_name}] Generating...{attempt_str}")
    if on_chunk:
        on_chunk(f"[Generating with {model_name}...{attempt_str}]\n")
    
    try:
        response = client.models.generate_content(
            model=model_name,
            contents=contents,
            config=config,
        )
    except Exception as e:
        print(f"[Gemini Error] {e}")
        if on_chunk:
            on_chunk(f"\n[Error: {e}]")
        raise
    
    # Process response
    result_image = None
    
    # Check if response has parts
    if not response.parts:
        print("[Gemini] No parts in response")
        error_msg = "No response parts - model may have blocked the request"
        
        # Check for candidates and block reason
        if hasattr(response, 'candidates') and response.candidates:
            for candidate in response.candidates:
                if hasattr(candidate, 'finish_reason'):
                    error_msg += f" (finish_reason: {candidate.finish_reason})"
                if hasattr(candidate, 'content') and candidate.content:
                    if hasattr(candidate.content, 'parts') and candidate.content.parts:
                        for part in candidate.content.parts:
                            if hasattr(part, 'text') and part.text:
                                print(part.text)
                                if on_chunk:
                                    on_chunk(part.text)
        
        if on_chunk:
            on_chunk(f"\n[{error_msg}]")
        
        # Raise exception so pipeline stops
        raise RuntimeError(error_msg)
    
    for part in response.parts:
        # Handle thinking process (Gemini 3 Pro)
        if part.thought:
            if part.text:
                print(f"[Thinking] {part.text}")
                if on_chunk:
                    on_chunk(f"[Thinking] {part.text}\n")
            elif (image := part.as_image()):
                print("[Thinking image generated - not showing in UI]")
                # Don't use thinking images as final result, don't show popup
            continue
        
        # Handle regular response parts
        if part.text is not None:
            print(part.text)
            if on_chunk:
                on_chunk(part.text)
        elif part.inline_data is not None:
            # Got an image
            print("[Received image from Gemini]")
            if on_chunk:
                on_chunk("\n[Image received]")
            # as_image() may return a Pydantic model, need to convert to PIL
            img_obj = part.as_image()
            if isinstance(img_obj, Image.Image):
                result_image = img_obj
            else:
                # Convert from Gemini's image format to PIL
                from io import BytesIO
                if hasattr(part.inline_data, 'data'):
                    img_data = part.inline_data.data
                    if isinstance(img_data, str):
                        import base64
                        img_data = base64.b64decode(img_data)
                    result_image = Image.open(BytesIO(img_data))
                elif hasattr(img_obj, '_pil_image'):
                    result_image = img_obj._pil_image
                elif hasattr(img_obj, 'data'):
                    result_image = Image.open(BytesIO(img_obj.data))
                else:
                    print(f"[Warning] Unknown image format: {type(img_obj)}")
                    result_image = img_obj  # Try anyway
    
    return result_image


def generate_image_gemini_pro(
    prompt: str,
    input_image_pil: Image.Image = None,
    on_chunk: callable = None,
) -> Image.Image:
    """
    Generate an image using Gemini 3 Pro Image Preview (best quality).
    
    Args:
        prompt: Text prompt for image generation
        input_image_pil: PIL Image as input (for img2img)
        on_chunk: Callback(text) for progress updates
        
    Returns:
        Generated PIL Image or None if no image generated
    """
    return generate_image_gemini(
        prompt=prompt,
        input_image_pil=input_image_pil,
        on_chunk=on_chunk,
        model="gemini-3-pro-image-preview",
    )
