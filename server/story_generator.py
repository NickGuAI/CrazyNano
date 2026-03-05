"""Story/prompt text generation with provider abstraction (mirrors image_generator.py pattern)."""
import os
import base64
from pathlib import Path
from dotenv import load_dotenv

# Load environment
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# Provider options
STORY_PROVIDER_GEMINI = "gemini"
STORY_PROVIDER_GROK = "grok"

AVAILABLE_STORY_PROVIDERS = [STORY_PROVIDER_GEMINI, STORY_PROVIDER_GROK]

# Default: Gemini
_current_story_provider = STORY_PROVIDER_GEMINI

# Gemini model for story/text generation
GEMINI_TEXT_MODEL = "gemini-2.5-flash"

# Grok models
GROK_CHAT_MODEL = "grok-beta"
GROK_REASONING_MODEL = "grok-4.1-fast-reasoning"


def set_story_provider(provider: str):
    """Set the current story generation provider."""
    global _current_story_provider
    if provider not in AVAILABLE_STORY_PROVIDERS:
        raise ValueError(f"Unknown provider: {provider}. Use 'gemini' or 'grok'")
    _current_story_provider = provider
    print(f"[StoryProvider] Set to: {provider}")


def get_story_provider() -> str:
    """Get the current story generation provider."""
    return _current_story_provider


def _get_gemini_api_key() -> str:
    """Get Gemini API key from environment."""
    try:
        from shared.components.secret_manager import SecretsManager
        secrets = SecretsManager([
            Path(__file__).parent.parent / ".env",
            Path(__file__).parent.parent.parent.parent / "shared/creds/.env"
        ])
        return secrets.get_secret("GEMINI_API_KEY")
    except (ImportError, Exception):
        return os.getenv("GEMINI_API_KEY")


def _get_poe_api_key() -> str:
    """Get POE API key from environment."""
    try:
        from shared.components.secret_manager import SecretsManager
        secrets = SecretsManager([
            Path(__file__).parent.parent / ".env",
            Path(__file__).parent.parent.parent.parent / "shared/creds/.env"
        ])
        return secrets.get_secret("POE_KEY")
    except (ImportError, Exception):
        return os.getenv("POE_KEY")


def generate_text(messages: list, system_prompt: str = None, on_chunk=None, provider: str = None) -> str:
    """
    Stream text generation for chat/brainstorm. Returns full text.

    Args:
        messages: List of {"role": "user"|"assistant", "content": str} dicts
        system_prompt: Optional system-level instruction
        on_chunk: Callback(text) for each streamed chunk
        provider: Override current provider ("gemini" or "grok")

    Returns:
        Full generated text string
    """
    use_provider = provider or _current_story_provider
    if use_provider == STORY_PROVIDER_GEMINI:
        return _generate_text_gemini(messages, system_prompt, on_chunk)
    else:
        return _generate_text_grok(messages, system_prompt, on_chunk)


def generate_structured_text(prompt: str, image_paths: list = None, on_chunk=None, provider: str = None) -> str:
    """
    Non-streaming structured text generation for frame/album prompts.

    Args:
        prompt: The full prompt to send (may include instructions and data)
        image_paths: Optional list of image file paths to include as context
        on_chunk: Optional progress callback(text)
        provider: Override current provider ("gemini" or "grok")

    Returns:
        Generated text string
    """
    use_provider = provider or _current_story_provider
    if use_provider == STORY_PROVIDER_GEMINI:
        return _generate_structured_text_gemini(prompt, image_paths, on_chunk)
    else:
        return _generate_structured_text_grok(prompt, image_paths, on_chunk)


# ============ Gemini Implementations ============

def _generate_text_gemini(messages: list, system_prompt: str = None, on_chunk=None) -> str:
    """Stream text via Gemini, returning full result."""
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        raise ImportError("Please install google-genai: pip install google-genai")

    api_key = _get_gemini_api_key()
    if not api_key:
        raise ValueError("GEMINI_API_KEY not found in environment")

    client = genai.Client(api_key=api_key)

    # Build contents from message history
    contents = []
    for msg in messages:
        role = "user" if msg["role"] == "user" else "model"
        contents.append(types.Content(role=role, parts=[types.Part(text=msg["content"])]))

    config = types.GenerateContentConfig(
        system_instruction=system_prompt if system_prompt else None,
    )

    print(f"[Gemini] Generating story text with {GEMINI_TEXT_MODEL}...")
    full_text = ""
    try:
        for chunk in client.models.generate_content_stream(
            model=GEMINI_TEXT_MODEL,
            contents=contents,
            config=config,
        ):
            if chunk.text:
                full_text += chunk.text
                if on_chunk:
                    on_chunk(chunk.text)
    except Exception as e:
        print(f"[Gemini] Text generation error: {e}")
        raise

    return full_text


def _generate_structured_text_gemini(prompt: str, image_paths: list = None, on_chunk=None) -> str:
    """Generate structured text (non-streaming) via Gemini, optionally with images."""
    try:
        from google import genai
        from PIL import Image
    except ImportError:
        raise ImportError("Please install google-genai and Pillow: pip install google-genai Pillow")

    api_key = _get_gemini_api_key()
    if not api_key:
        raise ValueError("GEMINI_API_KEY not found in environment")

    client = genai.Client(api_key=api_key)

    # Build contents — images first (if any), then text prompt
    contents = []
    if image_paths:
        for path in image_paths:
            img = Image.open(path)
            img.load()
            contents.append(img)

    contents.append(prompt)

    if on_chunk:
        on_chunk(f"[Generating with {GEMINI_TEXT_MODEL}...]\n")
    print(f"[Gemini] Generating structured text with {GEMINI_TEXT_MODEL}...")

    try:
        response = client.models.generate_content(
            model=GEMINI_TEXT_MODEL,
            contents=contents,
        )
    except Exception as e:
        print(f"[Gemini] Structured text generation error: {e}")
        raise

    result = response.text or ""
    print(f"[Gemini] Structured text complete ({len(result)} chars)")
    return result


# ============ Grok/POE Implementations ============

def _generate_text_grok(messages: list, system_prompt: str = None, on_chunk=None) -> str:
    """Stream text via Grok (POE) chat model."""
    import openai

    api_key = _get_poe_api_key()
    if not api_key:
        raise ValueError("POE_KEY not found in environment")

    client = openai.OpenAI(api_key=api_key, base_url="https://api.poe.com/v1")

    # Build messages including system
    full_messages = []
    if system_prompt:
        full_messages.append({"role": "system", "content": system_prompt})
    full_messages.extend(messages)

    print(f"[Grok] Streaming story text with {GROK_CHAT_MODEL}...")
    full_text = ""
    try:
        stream = client.chat.completions.create(
            model=GROK_CHAT_MODEL,
            messages=full_messages,
            stream=True,
        )
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                text = chunk.choices[0].delta.content
                full_text += text
                if on_chunk:
                    on_chunk(text)
    except Exception as e:
        print(f"[Grok] Text generation error: {e}")
        raise

    return full_text


def _get_image_mime_type(image_path: str) -> str:
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


def _generate_structured_text_grok(prompt: str, image_paths: list = None, on_chunk=None) -> str:
    """Generate structured text (non-streaming) via Grok reasoning model, optionally with images."""
    import openai

    api_key = _get_poe_api_key()
    if not api_key:
        raise ValueError("POE_KEY not found in environment")

    client = openai.OpenAI(api_key=api_key, base_url="https://api.poe.com/v1")

    # Build message content — images first (in order), then text
    content = []
    if image_paths:
        for path in image_paths:
            b64 = base64.b64encode(Path(path).read_bytes()).decode("utf-8")
            mime = _get_image_mime_type(str(path))
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{b64}"}
            })
    content.append({"type": "text", "text": prompt})

    if on_chunk:
        on_chunk(f"[Generating with {GROK_REASONING_MODEL}...]\n")
    print(f"[Grok] Generating structured text with {GROK_REASONING_MODEL}...")

    try:
        response = client.chat.completions.create(
            model=GROK_REASONING_MODEL,
            messages=[{"role": "user", "content": content}],
        )
    except Exception as e:
        print(f"[Grok] Structured text generation error: {e}")
        raise

    result = response.choices[0].message.content or ""
    print(f"[Grok] Structured text complete ({len(result)} chars)")
    return result
