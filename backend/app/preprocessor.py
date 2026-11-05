"""
CNIC Image Preprocessor and Card Normalizer

Handles:
1. Card perspective correction / boundary detection.
2. Normalization to standard dimensions (1000 x 630, ~1.587 ID-1 aspect ratio).
3. Contrast enhancement via CLAHE and unsharp masking.
4. Relative field region extraction.
"""

from __future__ import annotations

import cv2
import numpy as np

# Standard normalized dimensions for Pakistani CNIC
NORMALIZED_WIDTH = 1000
NORMALIZED_HEIGHT = 630

# Relative bounding box regions: (ymin, ymax, xmin, xmax) as fraction of H and W
FIELD_REGIONS: dict[str, tuple[float, float, float, float]] = {
    "name": (0.24, 0.44, 0.20, 0.80),
    "father_name": (0.42, 0.58, 0.20, 0.80),
    "gender": (0.57, 0.75, 0.20, 0.42),
    "country": (0.57, 0.75, 0.38, 0.60),
    "cnic": (0.68, 0.85, 0.20, 0.58),
    "dob": (0.68, 0.85, 0.48, 0.78),
    "issue": (0.80, 0.95, 0.20, 0.52),
    "expiry": (0.80, 0.95, 0.48, 0.78),
}


def order_points(pts: np.ndarray) -> np.ndarray:
    """Order coordinates: top-left, top-right, bottom-right, bottom-left."""
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]

    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def normalize_card_image(
    image: np.ndarray,
    output_size: tuple[int, int] = (NORMALIZED_WIDTH, NORMALIZED_HEIGHT),
) -> np.ndarray:
    """
    Detects card boundary and performs perspective transform if a card contour
    is detected against background. Otherwise resizes directly to 1000x630.
    """
    h, w = image.shape[:2]
    output_width, output_height = output_size

    # Quick check if card contour is distinct
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edged = cv2.Canny(blurred, 50, 200)

    contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    card_contour = None
    max_area = (h * w) * 0.30  # Card must be at least 30% of total image

    for c in sorted(contours, key=cv2.contourArea, reverse=True)[:5]:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) == 4:
            area = cv2.contourArea(approx)
            if area > max_area:
                # Check aspect ratio
                rect = order_points(approx.reshape(4, 2))
                width_a = np.linalg.norm(rect[2] - rect[3])
                width_b = np.linalg.norm(rect[1] - rect[0])
                max_w = max(int(width_a), int(width_b))

                height_a = np.linalg.norm(rect[1] - rect[2])
                height_b = np.linalg.norm(rect[0] - rect[3])
                max_h = max(int(height_a), int(height_b))

                if max_h > 0:
                    aspect = max_w / float(max_h)
                    if 1.2 <= aspect <= 2.0:
                        card_contour = rect
                        break

    if card_contour is not None:
        # Perspective warp to standard 1000x630
        dst = np.array([
            [0, 0],
            [output_width - 1, 0],
            [output_width - 1, output_height - 1],
            [0, output_height - 1]
        ], dtype="float32")
        M = cv2.getPerspectiveTransform(card_contour, dst)
        warped = cv2.warpPerspective(image, M, output_size)
        return warped

    # Fallback / direct normalization
    return cv2.resize(image, output_size, interpolation=cv2.INTER_AREA)


def enhance_card_image(image: np.ndarray) -> np.ndarray:
    """
    Applies CLAHE on the luminance channel and gentle unsharp masking
    to optimize contrast for low-contrast card text.
    """
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)

    # Contrast Limited Adaptive Histogram Equalization
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced_l = clahe.apply(l_channel)

    merged_lab = cv2.merge((enhanced_l, a_channel, b_channel))
    bgr_enhanced = cv2.cvtColor(merged_lab, cv2.COLOR_LAB2BGR)

    # Gentle unsharp mask
    gaussian = cv2.GaussianBlur(bgr_enhanced, (0, 0), 2.0)
    sharpened = cv2.addWeighted(bgr_enhanced, 1.25, gaussian, -0.25, 0)
    return sharpened


def get_field_crop(card_image: np.ndarray, field_key: str, margin_px: int = 4) -> np.ndarray:
    """
    Crops a specific field region based on relative coordinates.
    """
    if field_key not in FIELD_REGIONS:
        raise ValueError(f"Unknown field key: {field_key}")

    h, w = card_image.shape[:2]
    ymin_f, ymax_f, xmin_f, xmax_f = FIELD_REGIONS[field_key]

    ymin = max(0, int(ymin_f * h) - margin_px)
    ymax = min(h, int(ymax_f * h) + margin_px)
    xmin = max(0, int(xmin_f * w) - margin_px)
    xmax = min(w, int(xmax_f * w) + margin_px)

    crop = card_image[ymin:ymax, xmin:xmax]
    return crop
