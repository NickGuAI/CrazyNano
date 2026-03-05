"""Generate images using Grok-2 via xAI API."""
import os
import time
import requests
from pathlib import Path
from PIL import Image
from io import BytesIO
from openai import OpenAI


def generate_image_grok2(
    prompt: str,
    on_chunk: callable = None,
    max_retries: int = 3
) -> Image.Image:
    """
    Generate image using Grok-2 (text-only, no img2img support).

    Args:
        prompt: Text prompt for image generation
        on_chunk: Progress callback for status updates
        max_retries: Maximum retry attempts

    Returns:
        Generated PIL Image

    Raises:
        ValueError: If API key not found
        RuntimeError: If generation fails after retries
    """
    # Try to get API key from secrets manager
    try:
        from shared.components.secret_manager import SecretsManager
        secrets = SecretsManager([
            Path(__file__).parent / ".env",
            Path(__file__).parent.parent.parent / "shared/creds/.env"
        ])
        api_key = secrets.get_secret("XAI_API_KEY")
    except (ImportError, Exception):
        api_key = os.getenv("XAI_API_KEY")

    if not api_key:
        raise ValueError("XAI_API_KEY not found in environment")

    # Call implementation with retries
    for attempt in range(1, max_retries + 1):
        try:
            return _generate_image_grok2_impl(
                prompt=prompt,
                api_key=api_key,
                on_chunk=on_chunk,
                attempt=attempt,
                max_attempts=max_retries
            )
        except Exception as e:
            if attempt < max_retries:
                wait_time = attempt * 2  # Exponential backoff: 2s, 4s, 6s...
                if on_chunk:
                    on_chunk(f"[Grok-2 Retry {attempt}/{max_retries}] Error: {e}. Retrying in {wait_time}s...\n")
                time.sleep(wait_time)
            else:
                raise RuntimeError(f"Grok-2 generation failed after {max_retries} attempts: {e}") from e


def _generate_image_grok2_impl(
    prompt: str,
    api_key: str,
    on_chunk: callable = None,
    attempt: int = 1,
    max_attempts: int = 3
) -> Image.Image:
    """
    Implementation of Grok-2 image generation.

    Args:
        prompt: Text prompt
        api_key: xAI API key
        on_chunk: Progress callback
        attempt: Current attempt number
        max_attempts: Maximum attempts

    Returns:
        Generated PIL Image
    """
    if on_chunk:
        on_chunk(f"[Grok-2] Generating image (attempt {attempt}/{max_attempts})...\n")

    # Initialize OpenAI-compatible client
    client = OpenAI(
        base_url="https://api.x.ai/v1",
        api_key=api_key
    )

    # Generate image using Grok-2
    # NOTE: Grok-2 only supports text prompts, NO img2img or multi-image context
    response = client.images.generate(
        model="grok-2-image",
        prompt=prompt,
        response_format="url",
        n=1
    )

    # Get image URL from response
    image_url = response.data[0].url

    if on_chunk:
        on_chunk(f"[Grok-2] Downloading image from URL...\n")

    # Download image
    img_response = requests.get(image_url, timeout=30)
    img_response.raise_for_status()

    # Convert to PIL Image
    img = Image.open(BytesIO(img_response.content))

    # Force load to ensure image data is in memory
    img.load()

    if on_chunk:
        on_chunk(f"[Grok-2] Image generated successfully ({img.size[0]}x{img.size[1]})\n")

    return img
