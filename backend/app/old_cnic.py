"""Old-card name recognition, using an authenticated LOCAL vision worker.

Only detected name rows are supplied: never a CNIC number, DOB or identity
lookup. Names retain the script actually read from the card. Uncertain
or unavailable recognition leaves the field empty for operator review.
"""
from __future__ import annotations

import base64
import math
import logging
import os
from pathlib import Path
import re
import time
import unicodedata
from urllib.parse import urlparse

import cv2
import numpy as np
import requests

from .parser import BoxItem, validate_cnic, validate_date

logger = logging.getLogger("cnic-ocr.names")


class RecognitionUnavailable(ValueError):
    pass


def clean_urdu_name(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).replace("ي", "ی").replace("ك", "ک")
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.strip().strip('"\'`')
    text = re.sub(r"^(?:والد(?:\s*کا)?\s*نام|شوہر(?:\s*کا)?\s*نام|نام)(?=\s|[:：،]|$)\s*[:：،]?\s*", "", text)
    text = re.sub(r"\s+", " ", text).strip(" :،۔")
    if not 3 <= len(text) <= 90 or not 1 <= len(text.split()) <= 7:
        return ""
    if any(c.isdigit() or (not c.isspace() and not (c.isalpha() and '\u0600' <= c <= '\u06ff')) for c in text):
        return ""
    if set(text.split()) & {"نام", "والد", "شوہر", "مرد", "عورت", "جنس", "تصویر", "نہیں", "واضح", "شناختی", "کارڈ", "پاکستان", "نامعلوم", "ناقابل", "مطالعہ"}:
        return ""
    return text


def _english_name(text: str) -> str:
    text = re.sub(r"\s+", " ", text.strip().strip('"\'`'))
    text = re.sub(r"^(?:full\s+name|father(?:'s)?(?:\s+name)?|name)\s*:\s*", "", text, flags=re.I)
    if not re.fullmatch(r"[A-Za-z][A-Za-z .'-]{1,89}", text):
        return ""
    if set(text.lower().split()) & {"name", "father", "unknown", "unreadable", "sorry", "cannot", "image", "the", "is", "none", "null", "unavailable", "unclear", "empty", "blank", "unable", "can't", "not", "fullname", "fathername"}:
        return ""
    return text


def clean_native_name(text: str) -> str:
    """Validate source text without translating or transliterating a name."""
    return clean_urdu_name(text) or _english_name(text)


def _worker_request(prompt: str, image: np.ndarray | None = None, *, timeout: float = 25) -> tuple[str, float]:
    base = os.getenv("OCR_URDU_URL", "").rstrip("/")
    if not base:
        raise RecognitionUnavailable("Urdu name recognition is not configured.")
    address = urlparse(base)
    if address.scheme != "http" or address.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise RecognitionUnavailable("Urdu recognition must use the local worker.")
    key_path = os.getenv("OCR_URDU_KEY_FILE", "")
    try:
        key = Path(key_path).read_text(encoding="utf-8").strip() if key_path else ""
    except OSError as exc:
        raise RecognitionUnavailable("Urdu worker authentication is unavailable.") from exc
    if not key:
        raise RecognitionUnavailable("Urdu worker authentication is required.")
    content = [{"type": "text", "text": prompt}]
    if image is not None:
        ok, encoded = cv2.imencode(".png", image)
        if not ok:
            raise RecognitionUnavailable("Could not prepare the name image.")
        content.append({"type": "image_url", "image_url": {
            "url": "data:image/png;base64," + base64.b64encode(encoded).decode("ascii")}})
    try:
        response = requests.post(base + "/v1/chat/completions", headers={"Authorization": "Bearer " + key},
            json={"messages": [{"role": "user", "content": content}], "temperature": 0,
                  "max_tokens": 64, "cache_prompt": False, "logprobs": True, "top_logprobs": 1},
            timeout=(3, timeout))
        response.raise_for_status()
        choice = response.json()["choices"][0]
        if choice.get("finish_reason") != "stop":
            return "", 0.0
        probabilities = [math.exp(min(0.0, float(x["logprob"])))
                         for x in (choice.get("logprobs") or {}).get("content", []) if x.get("token")]
        return str(choice["message"]["content"]), sum(probabilities) / len(probabilities) if probabilities else 0.0
    except (requests.RequestException, ValueError, KeyError, IndexError, TypeError) as exc:
        raise RecognitionUnavailable("Urdu name recognition is temporarily unavailable.") from exc


def name_crop(card: np.ndarray, items: list[dict], field: str) -> np.ndarray | None:
    """Find actual detector rows in the old-card layout, excluding gender/DOB.

    Locations belong to the 1000x630 first pass. Crop the corresponding pixels
    from the higher-resolution card, preserving the complete Urdu label/line.
    No detected row means no generative guess at a name.
    """
    ymin, ymax = (0.39, 0.53) if field == "name" else (0.59, 0.69)
    boxes = [(BoxItem(item, 1000, 630), item["bbox"]) for item in items if item.get("bbox")]
    boxes = [(box, points) for box, points in boxes if ymin <= box.center_y <= ymax
             and 0.35 <= box.center_x <= 0.85
             and not validate_cnic(box.raw_text) and not validate_date(box.raw_text)]
    if not boxes:
        return None
    points = np.concatenate([np.asarray(points, dtype=np.float32) for _, points in boxes])
    h, w = card.shape[:2]
    x1, y1 = points.min(axis=0) / [1000, 630]
    x2, y2 = points.max(axis=0) / [1000, 630]
    # A detector polygon can merge the number above a name with the name row.
    # A center-in-region check alone does not keep those neighbouring pixels out.
    x1, x2 = max(int(.33 * w), int((x1 - .012) * w)), min(int(.88 * w), int((x2 + .012) * w))
    y1, y2 = max(int(ymin * h), int((y1 - .012) * h)), min(int(ymax * h), int((y2 + .012) * h))
    crop = card[y1:y2, x1:x2]
    if not crop.size or float(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY).std()) < 6:
        return None
    scale = min(900 / crop.shape[1], 160 / crop.shape[0], 1.0)
    if scale < 1:
        crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    # Exposure normalization makes shadowed and normally exposed captures
    # comparable without sharpening away Nastaliq dots or thin letter strokes.
    luminance = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    level = float(np.percentile(luminance, 80))
    if 0 < level < 100:
        crop = np.clip(crop.astype(np.float32) * (160.0 / level), 0, 255).astype(np.uint8)
    return crop


def recognize_names(card: np.ndarray, items: list[dict]) -> dict:
    start = time.perf_counter()
    deadline = start + 52
    output = {"name": "", "fatherName": "", "warnings": [],
              "fieldStatus": {"name": "not_attempted", "fatherName": "not_attempted"}}
    if os.getenv("OCR_ENABLE_URDU", "true").lower() != "true":
        output["fieldStatus"] = dict.fromkeys(("name", "fatherName"), "disabled")
        output["warnings"].append("Enter the old card's names manually; Urdu recognition is disabled.")
        output["durationMs"] = 0.0
        return output
    # Upscaling a small capture does not restore Nastaliq strokes/dots. Real
    # resized-card tests produced a confident but different name, so require
    # native detail and ask for a closer capture rather than trust that guess.
    if card.shape[1] < 1600:
        output["fieldStatus"] = dict.fromkeys(("name", "fatherName"), "insufficient_resolution")
        output["warnings"].append("Retake a closer, clearer photo or upload the original full-resolution image to read the old CNIC names.")
        logger.warning("old_cnic_names width=%s height=%s status=insufficient_resolution", card.shape[1], card.shape[0])
        output["durationMs"] = round((time.perf_counter() - start) * 1000, 2)
        return output
    for field in ("name", "fatherName"):
        if time.perf_counter() >= deadline:
            output["fieldStatus"][field] = "time_budget_exceeded"
            break
        crop = name_crop(card, items, field)
        if crop is None:
            output["fieldStatus"][field] = "no_readable_row"
            continue
        label = "نام" if field == "name" else "والد کا نام"
        prompt = (f"اس تصویر میں لکھا ہوا {label} حرف بہ حرف پڑھیں۔ صرف اصل نام لکھیں۔ "
                  "کوئی لفظ یا حرف شامل، حذف یا تبدیل نہ کریں۔")
        try:
            raw, confidence = _worker_request(prompt, crop, timeout=max(1, min(25, deadline - time.perf_counter())))
            # Geometry now clips merged neighbouring rows before recognition.
            # This is a review gate, not a calibrated probability of accuracy.
            # Apply the same gate to both isolated source-name rows.
            minimum = 0.80
            native = clean_native_name(raw) if confidence >= minimum else ""
            if not native:
                output["fieldStatus"][field] = "low_confidence" if confidence < minimum else "invalid_reading"
                continue
            output[field] = native
            output["fieldStatus"][field] = "read"
        except RecognitionUnavailable:
            for pending in output["fieldStatus"]:
                if output["fieldStatus"][pending] == "not_attempted":
                    output["fieldStatus"][pending] = "worker_unavailable"
            output["warnings"].append("Name recognition is unavailable. Verify and enter names from the original card.")
            break
    for field, label in (("name", "Full name"), ("fatherName", "Father / husband name")):
        if not output[field]:
            if output["fieldStatus"][field] == "not_attempted":
                output["fieldStatus"][field] = "time_budget_exceeded"
            output["warnings"].append(f"{label} was not read reliably. Retry with the original clear photo or enter it manually.")
    if not output["name"] or not output["fatherName"]:
        logger.warning("old_cnic_names width=%s height=%s status=%s", card.shape[1], card.shape[0], output["fieldStatus"])
    output["durationMs"] = round((time.perf_counter() - start) * 1000, 2)
    return output
