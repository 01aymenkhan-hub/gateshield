"""
CNIC / DLS OCR processing pipeline (runs inside an OCR worker process).

The processing steps below are moved verbatim from the original FastAPI
endpoints in `main.py` so that they can execute in a dedicated worker process
instead of on the FastAPI event loop. Behaviour is unchanged:

CNIC:
1. Decode image bytes.
2. Card normalization (perspective correction + 1000x630).
3. Contrast enhancement (CLAHE + unsharp mask).
4. Pass 1 full-card OCR.
5. Region-aware parser + targeted crop OCR fallback for missing fields.
6. Fallback full-card pass on the un-sharpened card if cnic/name still missing.

DLS:
1-3. Same decode / normalize / enhance.
4. Full-card OCR.
5. DLS field parser.

Only additions: per-stage wall-clock timings returned alongside the result.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import cv2
import numpy as np

from .ocr_engine import get_stage_timings, reset_stage_timings, run_ocr
from .preprocessor import normalize_card_image, enhance_card_image
from .parser import parse_cnic_fields
from .dls_parser import parse_dls_fields

logger = logging.getLogger("cnic-ocr")


class InvalidImageError(ValueError):
    """Raised when the uploaded bytes cannot be decoded into an image."""


def _decode(contents: bytes) -> np.ndarray:
    nparr = np.frombuffer(contents, np.uint8)
    raw_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if raw_img is None or raw_img.size == 0:
        raise InvalidImageError("Invalid image file or format.")
    return raw_img


def _finalize_timings(timings: dict[str, Any], started: float) -> dict[str, Any]:
    stage = get_stage_timings()
    timings["detection_s"] = round(stage.get("detection_s", 0.0), 4)
    timings["recognition_s"] = round(stage.get("recognition_s", 0.0), 4)
    timings["ocr_call_count"] = int(stage.get("ocr_call_count", 0))
    timings["processing_total_s"] = round(time.perf_counter() - started, 4)
    for key, value in list(timings.items()):
        if isinstance(value, float):
            timings[key] = round(value, 4)
    return timings


def process_cnic(contents: bytes) -> tuple[dict[str, Any], dict[str, Any]]:
    """Run the unchanged CNIC pipeline. Returns (response_dict, timings)."""
    reset_stage_timings()
    started = time.perf_counter()
    timings: dict[str, Any] = {"kind": "cnic"}

    t = time.perf_counter()
    raw_img = _decode(contents)
    timings["decode_s"] = time.perf_counter() - t

    # 1. Card normalization (perspective correction + standard working resolution 1000x630)
    # 2. Contrast enhancement (CLAHE + unsharp mask)
    t = time.perf_counter()
    normalized_card = normalize_card_image(raw_img)
    enhanced_card = enhance_card_image(normalized_card)
    timings["preprocess_s"] = time.perf_counter() - t

    # 3. Pass 1: Full-card OCR on preprocessed card
    t = time.perf_counter()
    ocr_result = run_ocr(enhanced_card)
    timings["pass1_ocr_s"] = time.perf_counter() - t

    # 4. Region-aware parser + targeted crop OCR fallback
    t = time.perf_counter()
    calls_before = get_stage_timings().get("ocr_call_count", 0)
    parsed_data = parse_cnic_fields(
        normalized_card=enhanced_card,
        pass1_ocr_results=ocr_result.get("results", []),
        ocr_runner=run_ocr,
    )
    timings["parse_and_crop_passes_s"] = time.perf_counter() - t
    timings["crop_pass_count"] = int(get_stage_timings().get("ocr_call_count", 0) - calls_before)

    # 5. Fallback pass on un-sharpened normalized_card if core identity fields are still missing
    # (Helps when CLAHE/unsharp masking amplifies guilloche or glare on imperfectly lit cards)
    t = time.perf_counter()
    fallback_used = False
    if not parsed_data.get("cnic") or not parsed_data.get("name"):
        fallback_used = True
        raw_ocr_result = run_ocr(normalized_card)
        raw_results = raw_ocr_result.get("results", [])
        if raw_results:
            fallback_parsed = parse_cnic_fields(
                normalized_card=normalized_card,
                pass1_ocr_results=raw_results,
                ocr_runner=None,
            )
            for k, v in fallback_parsed.items():
                if v and not parsed_data.get(k):
                    parsed_data[k] = v
            if not ocr_result.get("results"):
                ocr_result = raw_ocr_result
    timings["fallback_pass_s"] = time.perf_counter() - t
    timings["fallback_pass_used"] = fallback_used

    extracted_keys = [
        k for k in ("name", "fatherName", "cnic", "gender", "dateOfBirth", "dateOfIssue", "dateOfExpiry")
        if parsed_data.get(k)
    ]
    if extracted_keys:
        logger.info(
            "CNIC scan completed: boxes=%d, extracted_fields=%s",
            len(ocr_result.get("results", [])),
            extracted_keys,
        )
    else:
        logger.warning(
            "CNIC scan extracted zero fields: image_shape=%s, boxes=%d, raw_texts=%s",
            raw_img.shape,
            len(ocr_result.get("results", [])),
            ocr_result.get("text", [])[:10],
        )

    response = {
        "success": True,
        "parsed": {
            "name": parsed_data.get("name", ""),
            "fatherName": parsed_data.get("fatherName", ""),
            "gender": parsed_data.get("gender", ""),
            "countryOfStay": parsed_data.get("countryOfStay", ""),
            "cnic": parsed_data.get("cnic", ""),
            "dateOfBirth": parsed_data.get("dateOfBirth", ""),
            "dateOfIssue": parsed_data.get("dateOfIssue", ""),
            "dateOfExpiry": parsed_data.get("dateOfExpiry", ""),
            "cnicIdentification": parsed_data.get("cnicIdentification", ""),
            # Aliases for backward compatibility
            "fullName": parsed_data.get("fullName", parsed_data.get("name", "")),
            "fatherHusbandName": parsed_data.get("fatherHusbandName", parsed_data.get("fatherName", "")),
            "cnicNumber": parsed_data.get("cnicNumber", parsed_data.get("cnic", "")),
        },
        "text": ocr_result.get("text", []),
        "results": ocr_result.get("results", []),
        "details": ocr_result.get("details", []),
    }
    return response, _finalize_timings(timings, started)


def process_dls(contents: bytes) -> tuple[dict[str, Any], dict[str, Any]]:
    """Run the unchanged DLS pipeline. Returns (response_dict, timings)."""
    reset_stage_timings()
    started = time.perf_counter()
    timings: dict[str, Any] = {"kind": "dls"}

    t = time.perf_counter()
    raw_img = _decode(contents)
    timings["decode_s"] = time.perf_counter() - t

    # 1. Card normalization (perspective correction + standard working resolution 1000x630)
    # 2. Contrast enhancement (CLAHE + unsharp mask)
    t = time.perf_counter()
    normalized_card = normalize_card_image(raw_img)
    enhanced_card = enhance_card_image(normalized_card)
    timings["preprocess_s"] = time.perf_counter() - t

    # 3. Full-card OCR on preprocessed DLS card
    t = time.perf_counter()
    ocr_result = run_ocr(enhanced_card)
    timings["pass1_ocr_s"] = time.perf_counter() - t

    # 4. DLS field parser
    t = time.perf_counter()
    parsed_data = parse_dls_fields(
        normalized_card=enhanced_card,
        ocr_results=ocr_result.get("results", []),
    )
    timings["parse_and_crop_passes_s"] = time.perf_counter() - t
    timings["crop_pass_count"] = 0
    timings["fallback_pass_s"] = 0.0
    timings["fallback_pass_used"] = False

    response = {
        "success": True,
        "parsed": {
            "licenseNumber": parsed_data.get("licenseNumber", ""),
            "fullName": parsed_data.get("fullName", ""),
            "fatherHusbandName": parsed_data.get("fatherHusbandName", ""),
            "dateOfBirth": parsed_data.get("dateOfBirth", ""),
            "category": parsed_data.get("category", ""),
            "issueDate": parsed_data.get("issueDate", ""),
            "validUpto": parsed_data.get("validUpto", ""),
            "licensingAuthority": parsed_data.get("licensingAuthority", ""),
        },
        "text": ocr_result.get("text", []),
        "results": ocr_result.get("results", []),
        "details": ocr_result.get("details", []),
    }
    return response, _finalize_timings(timings, started)
