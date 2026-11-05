"""
Driving License Sindh (DLS) Parser & Validator

Extracts the 8 required fields from a Sindh Driving License card:
1. licenseNumber       — next to / under "License No."
2. fullName            — next to / under "Name:"
3. fatherHusbandName   — next to / under "Father/Husband:"
4. dateOfBirth         — next to / under "Date of Birth:"
5. category            — complete category e.g. "M CYCLE, M CAR"
6. issueDate           — next to / under "Issue Date:"
7. validUpto           — next to / under "Valid Upto:"
8. licensingAuthority  — complete authority (DSP Name, DL Branch, City)
"""

from __future__ import annotations

import re
import logging
from datetime import date
from typing import Any, Optional
import numpy as np

logger = logging.getLogger("cnic-ocr.dls_parser")

MONTH_ABBRS = {
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec"
}


class DlsBoxItem:
    """Detected OCR text item with normalized coordinates (0..1)."""

    def __init__(self, item: dict[str, Any], card_w: int, card_h: int):
        self.raw_text = str(item.get("text", "")).strip()
        self.confidence = float(item.get("confidence", 0.0))
        bbox = item.get("bbox", [])

        if bbox and len(bbox) >= 4:
            xs = [p[0] for p in bbox]
            ys = [p[1] for p in bbox]
            self.min_x = min(xs) / float(card_w)
            self.max_x = max(xs) / float(card_w)
            self.min_y = min(ys) / float(card_h)
            self.max_y = max(ys) / float(card_h)
        else:
            self.min_x = self.max_x = self.min_y = self.max_y = 0.0

        self.center_x = (self.min_x + self.max_x) / 2.0
        self.center_y = (self.min_y + self.max_y) / 2.0
        self.height = self.max_y - self.min_y
        self.width = self.max_x - self.min_x


# ---------------------------------------------------------------------------
# Strict Date and Text Normalizers
# ---------------------------------------------------------------------------

def extract_date_from_string(text: str) -> tuple[str, str]:
    """
    Extracts a date from a string and returns (date_str, remaining_text).
    Supports DD-Mon-YYYY (e.g., 25-Jun-1986, 27-May-2028).
    """
    if not text:
        return "", ""

    # Match DD-Mon-YYYY
    m = re.search(r"\b(\d{1,2})[-\s/]([A-Za-z]{3,9})[-\s/](\d{4})\b", text)
    if m:
        d = int(m.group(1))
        mon = m.group(2).capitalize()[:3]
        y = int(m.group(3))
        valid = False
        try:
            month_number = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].index(mon.lower()) + 1
            date(y, month_number, d)
            valid = 1900 <= y <= 2100
        except ValueError:
            pass
        if valid:
            date_str = f"{d:02d}-{mon}-{y:04d}"
            # Extract text before and after the date
            remaining = (text[:m.start()] + " " + text[m.end():]).strip()
            return date_str, remaining

    # Match DD-MM-YYYY or DD.MM.YYYY
    m_num = re.search(r"\b(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})\b", text)
    if m_num:
        d = int(m_num.group(1))
        mth = int(m_num.group(2))
        y = int(m_num.group(3))
        valid = False
        try:
            date(y, mth, d)
            valid = 1900 <= y <= 2100
        except ValueError:
            pass
        if valid:
            months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            date_str = f"{d:02d}-{months[mth-1]}-{y:04d}"
            remaining = (text[:m_num.start()] + " " + text[m_num.end():]).strip()
            return date_str, remaining

    return "", text


def format_category(cat_text: str) -> str:
    """Normalizes category e.g. 'MCYCLE,MCAR' -> 'M CYCLE, M CAR'."""
    text = cat_text.upper().replace(" ", "")
    parts = []
    if "MCYCLE" in text or "MOTORCYCLE" in text or "M/CYCLE" in text:
        parts.append("M CYCLE")
    if "MCAR" in text or "MOTORCAR" in text or "M/CAR" in text:
        parts.append("M CAR")
    if "LTV" in text:
        parts.append("LTV")
    if "HTV" in text:
        parts.append("HTV")

    if parts:
        return ", ".join(parts)
    # Fallback to cleaning input
    cleaned = re.sub(r"\bMCYCLE\b", "M CYCLE", cat_text, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bMCAR\b", "M CAR", cleaned, flags=re.IGNORECASE)
    return cleaned.replace(",", ", ").strip()


def fix_concatenated_name(name_text: str) -> str:
    """Inserts spaces if common Pakistani names are concatenated e.g. 'MUHAMMADARSALAN'."""
    clean = re.sub(r"[^A-Za-z\s\.\-']", "", name_text).strip()
    if " " in clean:
        return clean

    # Check for MUHAMMAD prefix
    if clean.upper().startswith("MUHAMMAD") and len(clean) > 8:
        return "MUHAMMAD " + clean[8:].strip()
    if clean.upper().startswith("MOHAMMAD") and len(clean) > 8:
        return "MOHAMMAD " + clean[8:].strip()
    if clean.upper().startswith("SYED") and len(clean) > 4:
        return "SYED " + clean[4:].strip()

    return clean


def format_authority_text(raw_lines: list[str]) -> str:
    """
    Cleans and joins Licensing Authority lines (DSP Name, DL Branch, City).
    Handles concatenated OCR artifacts like 'DSPMUNIRAHMEDAWAN', 'DLSaudabad', 'DLClton'.
    """
    cleaned_pieces = []
    for line in raw_lines:
        t = line.strip(" :.-")
        if not t or re.match(r"^Licens(?:ing|ang)\s*Authority$", t, re.IGNORECASE):
            continue

        # Fix 'DSPMUNIRAHMEDAWAN' -> 'DSP MUNIR AHMED AWAN'
        if re.search(r"DSP[A-Za-z]", t):
            t = re.sub(r"^DSP\s*", "DSP ", t, flags=re.IGNORECASE)
            # Break common words if concatenated
            t = re.sub(r"MUNIR", "MUNIR ", t)
            t = re.sub(r"AHMED", "AHMED ", t)
            t = re.sub(r"AWAN", "AWAN ", t)
            t = re.sub(r"\s+", " ", t).strip()

        # Fix 'DLClton' -> 'DL Clifton', 'DLSaudabad' -> 'DL Saudabad'
        t = re.sub(r"DL\s*Cl[a-z]*ton", "DL Clifton", t, flags=re.IGNORECASE)
        t = re.sub(r"DL\s*Saud[a-z]*", "DL Saudabad", t, flags=re.IGNORECASE)

        # Fix 'M.Ayoob' -> 'M. Ayoob'
        t = re.sub(r"\bM\.([A-Za-z])", r"M. \1", t)

        # Skip if line is just a date
        d_check, rem_check = extract_date_from_string(t)
        if d_check and not rem_check:
            continue

        if t and t not in cleaned_pieces:
            cleaned_pieces.append(t)

    res = ", ".join(cleaned_pieces)

    # Normalize double commas and whitespace
    res = re.sub(r"\s*,\s*", ", ", res).strip(" ,")
    return res


# ---------------------------------------------------------------------------
# Main DLS Field Parser
# ---------------------------------------------------------------------------

def parse_dls_fields(
    normalized_card: np.ndarray,
    ocr_results: list[dict[str, Any]],
) -> dict[str, str]:
    """
    Parses all 8 required DLS fields:
    - licenseNumber
    - fullName
    - fatherHusbandName
    - dateOfBirth
    - category
    - issueDate
    - validUpto
    - licensingAuthority
    """
    card_h, card_w = normalized_card.shape[:2]
    boxes = [DlsBoxItem(item, card_w=card_w, card_h=card_h) for item in ocr_results]

    extracted: dict[str, str] = {
        "licenseNumber": "",
        "fullName": "",
        "fatherHusbandName": "",
        "dateOfBirth": "",
        "category": "",
        "issueDate": "",
        "validUpto": "",
        "licensingAuthority": "",
    }

    authority_raw_pieces: list[str] = []

    # 1. License Number
    # Look for DLS pattern: \d{5}-\d{7}-\d(?:#\d+)? or alphanumeric
    for b in boxes:
        m = re.search(r"\b(\d{5}-\d{7}-\d(?:#\d+)?)\b", b.raw_text)
        if m:
            extracted["licenseNumber"] = m.group(1)
            break
        # Also check label "License No."
        if "license" in b.raw_text.lower() and "no" in b.raw_text.lower():
            # Check after label
            after = re.split(r"license\s*no\.?", b.raw_text, flags=re.IGNORECASE)
            if len(after) > 1 and after[1].strip(" :.-"):
                extracted["licenseNumber"] = after[1].strip(" :.-")
                break

    # If still empty, check box right of "License No."
    if not extracted["licenseNumber"]:
        lic_box = next((b for b in boxes if "license" in b.raw_text.lower()), None)
        if lic_box:
            cands = [b for b in boxes if b.min_x > lic_box.min_x and abs(b.center_y - lic_box.center_y) < 0.05]
            if cands:
                cands.sort(key=lambda c: c.min_x)
                extracted["licenseNumber"] = cands[0].raw_text.strip(" :.-")

    # 2. Name
    name_box = next((b for b in boxes if re.search(r"^Name\b", b.raw_text, re.IGNORECASE)), None)
    if name_box:
        # Check if value is in same line e.g. "Name: AMMAR AHMED SIDDIQUE"
        parts = re.split(r"^Name\s*[:\.]?", name_box.raw_text, flags=re.IGNORECASE)
        if len(parts) > 1 and parts[1].strip(" :.-"):
            extracted["fullName"] = fix_concatenated_name(parts[1].strip(" :.-"))
        else:
            # Look for candidate on the same horizontal line or immediately below
            cands = [
                b for b in boxes
                if b is not name_box
                and abs(b.center_y - name_box.center_y) <= 0.04
                and b.min_x > name_box.min_x
            ]
            if not cands:
                cands = [
                    b for b in boxes
                    if b is not name_box
                    and 0 < (b.center_y - name_box.center_y) <= 0.06
                    and abs(b.center_x - name_box.center_x) < 0.35
                ]
            for c in cands:
                clean = fix_concatenated_name(c.raw_text)
                if len(clean) >= 3 and not any(k in clean.lower() for k in ["license", "father", "date", "birth"]):
                    extracted["fullName"] = clean
                    break

    # Fallback for name from boxes
    if not extracted["fullName"]:
        for b in boxes:
            if 0.22 <= b.center_y <= 0.38 and 0.40 <= b.center_x <= 0.85:
                if re.match(r"^[A-Z\s]{4,}$", b.raw_text) and not any(k in b.raw_text.lower() for k in ["license", "sindh", "father"]):
                    extracted["fullName"] = fix_concatenated_name(b.raw_text)
                    break

    # 3. Father / Husband Name
    fh_box = next((b for b in boxes if "father" in b.raw_text.lower()), None)
    if fh_box:
        # Check if value in same line e.g. "Father/Husband: ZAFAR AHMED"
        parts = re.split(r"father(?:/husband)?\s*[:\.]?", fh_box.raw_text, flags=re.IGNORECASE)
        if len(parts) > 1 and parts[1].strip(" :.-"):
            extracted["fatherHusbandName"] = parts[1].strip(" :.-")
        else:
            # Check candidate to the right
            cands = [
                b for b in boxes
                if b is not fh_box
                and abs(b.center_y - fh_box.center_y) <= 0.04
                and b.min_x > fh_box.min_x
            ]
            if cands:
                cands.sort(key=lambda c: c.min_x)
                clean = re.sub(r"[^A-Za-z\s\.\-']", "", cands[0].raw_text).strip()
                if len(clean) >= 3:
                    extracted["fatherHusbandName"] = clean

    # 4. Date of Birth
    dob_box = next((b for b in boxes if "birth" in b.raw_text.lower() or "d.o.b" in b.raw_text.lower()), None)
    if dob_box:
        d, _ = extract_date_from_string(dob_box.raw_text)
        if d:
            extracted["dateOfBirth"] = d
        else:
            cands = [
                b for b in boxes
                if b is not dob_box
                and (
                    abs(b.center_y - dob_box.center_y) <= 0.04
                    or (0 < b.center_y - dob_box.center_y <= 0.06)
                )
            ]
            for c in cands:
                d, _ = extract_date_from_string(c.raw_text)
                if d:
                    extracted["dateOfBirth"] = d
                    break

    # 5. Category
    cat_box = next((b for b in boxes if "category" in b.raw_text.lower()), None)
    if cat_box:
        parts = re.split(r"category\s*[:\.]?", cat_box.raw_text, flags=re.IGNORECASE)
        if len(parts) > 1 and parts[1].strip(" :.-"):
            extracted["category"] = format_category(parts[1].strip(" :.-"))
        else:
            cands = [
                b for b in boxes
                if b is not cat_box
                and abs(b.center_y - cat_box.center_y) <= 0.05
                and b.min_x > cat_box.min_x
            ]
            if cands:
                extracted["category"] = format_category(cands[0].raw_text)

    # Search for category pattern anywhere if empty
    if not extracted["category"]:
        for b in boxes:
            if "CYCLE" in b.raw_text.upper() or "CAR" in b.raw_text.upper():
                extracted["category"] = format_category(b.raw_text)
                break

    # 6 & 7. Issue Date and Valid Upto
    # Locate "Issue Date" and "Valid Upto"
    issue_box = next((b for b in boxes if "issue" in b.raw_text.lower() and "date" in b.raw_text.lower()), None)
    valid_box = next((b for b in boxes if "valid" in b.raw_text.lower()), None)

    for b in boxes:
        d, rem = extract_date_from_string(b.raw_text)
        if d:
            # Check if this box is near Issue Date or on bottom left (x < 0.48)
            if issue_box and abs(b.center_x - issue_box.center_x) < 0.20 and b.center_y >= issue_box.center_y - 0.02:
                if not extracted["issueDate"]:
                    extracted["issueDate"] = d
            elif valid_box and abs(b.center_x - valid_box.center_x) < 0.20 and b.center_y >= valid_box.center_y - 0.02:
                if not extracted["validUpto"]:
                    extracted["validUpto"] = d
                    if rem:
                        authority_raw_pieces.append(rem)
            else:
                # Spatial heuristic: Issue date is left of Valid Upto
                if b.center_x < 0.48 and 0.65 <= b.center_y <= 0.90:
                    if not extracted["issueDate"]:
                        extracted["issueDate"] = d
                elif 0.48 <= b.center_x <= 0.75 and 0.65 <= b.center_y <= 0.90:
                    if not extracted["validUpto"]:
                        extracted["validUpto"] = d
                        if rem:
                            authority_raw_pieces.append(rem)

    # 8. Licensing Authority
    for b in boxes:
        text = b.raw_text.strip()
        # Look for DSP, DL, Clifton, Saudabad, Karachi
        if any(k in text.lower() for k in ["dsp", "dl clifton", "dlclton", "dl saudabad", "dlsaudabad", "karachi", "clifton", "saudabad"]):
            # If the box also has a date, extract only the non-date part
            _, rem = extract_date_from_string(text)
            if rem:
                authority_raw_pieces.append(rem)
            else:
                authority_raw_pieces.append(text)
        elif 0.65 <= b.center_y <= 0.95 and b.center_x > 0.60:
            # Boxes in the bottom-right quadrant
            if not any(k in text.lower() for k in ["licens", "author", "valid", "issue"]):
                d_val, rem = extract_date_from_string(text)
                if d_val:
                    if rem and len(rem) >= 3 and not re.match(r"^[\d\-\/]+$", rem):
                        authority_raw_pieces.append(rem)
                else:
                    if len(text) >= 3 and not re.match(r"^[\d\-\/]+$", text):
                        authority_raw_pieces.append(text)

    extracted["licensingAuthority"] = format_authority_text(authority_raw_pieces)

    # A nearby title/label is not a licence number. Preserve supported numeric
    # and prefixed alphanumeric formats, reject free-form OCR noise.
    licence = extracted["licenseNumber"]
    if not re.fullmatch(r"[1-7]\d{4}-\d{7}-\d(?:#\d+)?|[A-Z]{1,8}[-/][A-Z0-9][A-Z0-9/-]{3,24}", licence, re.IGNORECASE):
        extracted["licenseNumber"] = ""
    return extracted
