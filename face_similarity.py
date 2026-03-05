"""Face similarity detection using face_recognition library."""
import numpy as np
from PIL import Image
from typing import Optional

# Try to import face_recognition, gracefully handle failure
try:
    import face_recognition
    FACE_RECOGNITION_AVAILABLE = True
except ImportError:
    FACE_RECOGNITION_AVAILABLE = False
    print("[Warning] face_recognition not available. Install with: pip install face-recognition")


def detect_face_encoding(image: Image.Image) -> Optional[np.ndarray]:
    """
    Detect and encode the primary face in an image.

    Args:
        image: PIL Image

    Returns:
        128-d face encoding array, or None if no face found
    """
    if not FACE_RECOGNITION_AVAILABLE:
        return None

    # Convert PIL to RGB numpy array
    img_array = np.array(image.convert('RGB'))

    # Detect face encodings
    face_encodings = face_recognition.face_encodings(img_array)

    if len(face_encodings) == 0:
        return None

    if len(face_encodings) == 1:
        return face_encodings[0]

    # Multiple faces - use largest face (by bounding box area)
    face_locations = face_recognition.face_locations(img_array)
    largest_idx = 0
    largest_area = 0
    for i, (top, right, bottom, left) in enumerate(face_locations):
        area = (bottom - top) * (right - left)
        if area > largest_area:
            largest_area = area
            largest_idx = i

    return face_encodings[largest_idx]


def calculate_similarity(image1: Image.Image, image2: Image.Image) -> Optional[float]:
    """
    Calculate face similarity between two images.

    Args:
        image1: First PIL Image
        image2: Second PIL Image

    Returns:
        Similarity score 0.0-1.0 (1.0 = identical), or None if face not detected
    """
    if not FACE_RECOGNITION_AVAILABLE:
        return None

    # Get face encodings
    encoding1 = detect_face_encoding(image1)
    encoding2 = detect_face_encoding(image2)

    if encoding1 is None or encoding2 is None:
        return None

    # Calculate face distance (0 = identical, increases with difference)
    distance = face_recognition.face_distance([encoding1], encoding2)[0]

    # Convert to similarity using asymptotic formula: similarity = 1 / (1 + distance)
    # This ensures output is always in range (0, 1]
    similarity = 1.0 / (1.0 + distance)

    return similarity


def meets_threshold(similarity: Optional[float], threshold: float = 0.85) -> bool:
    """
    Check if similarity meets threshold.

    Args:
        similarity: Similarity score (or None)
        threshold: Minimum acceptable similarity

    Returns:
        True if meets threshold, False otherwise
        If similarity is None, returns True (graceful degradation)
    """
    if similarity is None:
        return True  # Can't validate, accept image
    return similarity >= threshold
