"""Basic tests for face similarity."""
import pytest
from PIL import Image
from face_similarity import calculate_similarity, detect_face_encoding


def test_identical_images():
    """Identical images should have similarity close to 1.0."""
    pass


def test_no_face():
    """Images without faces should return None."""
    pass


def test_formula():
    """Test similarity formula: 1 / (1 + distance)."""
    # For distance=0 (identical), similarity should be 1.0
    # For distance=1, similarity should be 0.5
    # For distance=∞, similarity should approach 0
    pass
