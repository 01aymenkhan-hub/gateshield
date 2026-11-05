"""Synchronous image work. The API runs this in its bounded inference worker."""
from __future__ import annotations

import io
import logging
import os
import re
import time
import warnings
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from .ocr_engine import orient_image, run_ocr
from .preprocessor import enhance_card_image, normalize_card_image
from .parser import BoxItem, detect_cnic_format, parse_cnic_fields, validate_date
from .dls_parser import parse_dls_fields

logger = logging.getLogger("cnic-ocr.pipeline")


class InvalidImage(ValueError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def decode_image(contents: bytes) -> np.ndarray:
    if not contents:
        raise InvalidImage("The uploaded image is empty.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(contents)) as image:
                if image.width * image.height > int(os.getenv("OCR_MAX_PIXELS", "32000000")):
                    raise InvalidImage("Image resolution exceeds the configured pixel limit.", 413)
                if image.width < 32 or image.height < 32:
                    raise InvalidImage("Image is too small. Capture the complete card clearly.")
                rgb = np.asarray(ImageOps.exif_transpose(image).convert("RGB"))
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError,
            Image.DecompressionBombWarning) as exc:
        raise InvalidImage("Invalid or damaged image file.") from exc
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    if float(gray.std()) < 3.0:
        raise InvalidImage("No readable card found. Capture a focused image of the card.", 422)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def process_image(contents: bytes, document: str) -> dict[str, Any]:
    start = time.perf_counter()
    raw = decode_image(contents)
    raw, rotation = orient_image(raw)
    normalized = normalize_card_image(raw)
    enhanced = enhance_card_image(normalized)
    preprocess_ms = (time.perf_counter() - start) * 1000
    calls = 0
    inference_ms = 0.0
    name_inference_ms = 0.0
    name_warnings: list[str] = []
    name_status: dict[str, str] = {}
    conversion = {"status": {}, "warnings": [], "durationMs": 0.0}

    def front_supported(result: dict[str, Any]) -> bool:
        combined = " ".join(result["text"]).lower()
        return any(validate_date(text) for text in result["text"]) or any(
            label in combined for label in ("national identity", "identity number", "country of stay", "date of birth", "father name"))

    def infer(image: np.ndarray) -> dict[str, Any]:
        nonlocal calls, inference_ms
        calls += 1
        t = time.perf_counter()
        result = run_ocr(image)
        inference_ms += (time.perf_counter() - t) * 1000
        return result

    def parse(image: np.ndarray, result: dict[str, Any], source: np.ndarray) -> tuple[dict[str, str], str]:
        nonlocal name_inference_ms, name_status
        combined = " ".join(result["text"]).lower()
        if document == "cnic" and re.search(r"driving\s*licen[cs]e", combined):
            raise InvalidImage("This looks like a driving licence. Use the driving licence scanner.", 422)
        if document == "dls" and ("national identity" in combined or "country of stay" in combined):
            raise InvalidImage("This looks like a CNIC. Use the CNIC scanner.", 422)
        if document == "dls":
            return parse_dls_fields(image, result["results"]), "driving_licence"
        h, w = image.shape[:2]
        kind = detect_cnic_format([BoxItem(x, w, h) for x in result["results"]])
        # The first pass already detects every line. Crop retries are bounded
        # below instead of running up to four complete detector passes here.
        parsed_card = parse_cnic_fields(image, result["results"], ocr_runner=None)
        if kind == "old":
            # Fast old-card mode: recognize numeric/core fields only. Unreliable
            # Urdu names are deliberately left for the operator to enter.
            parsed_card.update(name="", fatherName="", fullName="", fatherHusbandName="",
                               dateOfIssue="", dateOfExpiry="")
        return parsed_card, kind + "_cnic"

    def core_score(parsed: dict[str, str]) -> int:
        keys = ("licenseNumber", "fullName", "fatherHusbandName", "dateOfBirth") if document == "dls" else ("cnic", "name", "fatherName", "dateOfBirth")
        return sum(bool(parsed.get(k)) for k in keys)

    ocr = infer(enhanced)
    parsed, kind = parse(enhanced, ocr, raw)
    # Rotate only when core identity extraction fails. Normal cards use one pass.
    if core_score(parsed) < 2 or (document == "cnic" and not front_supported(ocr)):
        rotated = cv2.rotate(enhanced, cv2.ROTATE_180)
        candidate_ocr = infer(rotated)
        candidate, candidate_kind = parse(rotated, candidate_ocr, cv2.rotate(raw, cv2.ROTATE_180))
        if core_score(candidate) > core_score(parsed) or (document == "cnic" and front_supported(candidate_ocr) and not front_supported(ocr)):
            enhanced, ocr, parsed, kind = rotated, candidate_ocr, candidate, candidate_kind
    # Try unsharpened data only for a missing ID/name, with a hard 3-pass cap.
    id_key, name_key = ("licenseNumber", "fullName") if document == "dls" else ("cnic", "name")
    if (not parsed.get(id_key) or not parsed.get(name_key)) and kind != "old_cnic" and calls < 3:
        candidate_ocr = infer(normalized)
        candidate, candidate_kind = parse(normalized, candidate_ocr, raw)
        if core_score(candidate) > core_score(parsed):
            ocr, parsed, kind = candidate_ocr, candidate, candidate_kind

    if document == "cnic":
        if not front_supported(ocr):
            raise InvalidImage("Could not identify the CNIC front. Capture the front side clearly.", 422)
        if kind == "old_cnic":
            if not parsed.get("cnic"):
                raise InvalidImage("Could not read the old CNIC number. Retake a clear photo of the complete front side.", 422)
            name_status = dict.fromkeys(("name", "fatherName"), "manual_entry")
            name_warnings = ["Old CNIC: enter Full Name and Father / Husband Name manually. Verify the scanned CNIC number against the card."]
        # Aliases are always derived from the final authoritative fields.
        parsed.update(fullName=parsed.get("name", ""),
                      fatherHusbandName=parsed.get("fatherName", ""),
                      cnicNumber=parsed.get("cnic", ""))
        required = ["name", "fatherName", "cnic", "gender", "dateOfBirth"]
        if kind == "smart_cnic":
            required += ["dateOfIssue", "dateOfExpiry"]
        else:
            required += ["cnicIdentification"]
    else:
        required = ["licenseNumber", "fullName", "fatherHusbandName", "dateOfBirth",
                    "category", "issueDate", "validUpto", "licensingAuthority"]
    missing = [k for k in required if not parsed.get(k)]
    scores = [float(x.get("confidence", 0)) for x in ocr["results"]]
    confidence = round(sum(scores) / len(scores), 4) if scores else 0.0
    authority_scores = []
    if document == "dls":
        for item in ocr["results"]:
            box = BoxItem(item, enhanced.shape[1], enhanced.shape[0])
            if box.center_y >= 0.65 and box.center_x >= 0.60 and re.search(r"\bDSP|\bDL|karachi|clifton|saudabad", box.raw_text, re.IGNORECASE):
                authority_scores.append(float(item.get("confidence", 0)))
    uncertain_authority = document == "dls" and (not authority_scores or min(authority_scores) < 0.97)
    if not parsed.get(id_key) and not parsed.get(name_key):
        raise InvalidImage("Could not read a valid identity number or name. Capture a clearer card image.", 422)
    # Mean line confidence is diagnostic, not a guarantee that a field is right.
    elapsed = round((time.perf_counter() - start) * 1000, 2)
    logger.info("scan document=%s duration_ms=%s passes=%s missing_fields=%s", kind, elapsed, calls, missing)
    return {
        "success": True, "parsed": parsed, "text": ocr["text"],
        "results": ocr["results"], "details": ocr["results"],
        "quality": {"documentType": kind, "needsReview": bool(missing) or confidence < 0.90 or kind == "old_cnic" or uncertain_authority,
                    "nameRecognition": name_status,
                    "nameTransliteration": conversion["status"],
                    "missingFields": missing, "meanTextConfidence": confidence,
                    "warnings": (["Verify extracted names against the original card."] + name_warnings + conversion["warnings"] if kind == "old_cnic" else [])
                                + (["Verify the small licensing authority text against the original licence."] if uncertain_authority else [])},
        "timing": {"processingMs": elapsed, "preprocessingMs": round(preprocess_ms, 2),
                   "inferenceMs": round(inference_ms, 2), "nameRecognitionMs": round(name_inference_ms, 2),
                   "transliterationMs": conversion["durationMs"],
                   "ocrPasses": calls, "orientationDegrees": rotation},
    }
