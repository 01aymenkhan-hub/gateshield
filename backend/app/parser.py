"""
Pakistani CNIC Field Parser & Region-Aware Validator

Implements:
1. Automatic detection of card format:
   - Pakistani Smart CNIC (chip card)
   - Old-format Pakistani CNIC
2. Smart CNIC:
   - Relative spatial layout matching (rejects photo, chip, Urdu text, signature).
   - Strict field-specific validation (CNIC format, Gender, Dates, Names, Country).
   - Selective fallback: targeted OCR on missing fields.
   - cnicIdentification remains empty ("").
3. Old-format CNIC:
   - Layout matching: CNIC Number, Date of Birth, Gender, Identification mark, Urdu Names.
   - Urdu-to-English translation & transliteration.
   - Gender derived from NADRA numbering rule (odd = Male, even = Female) and visual markers.
   - Date of Issue and Date of Expiry are strictly empty ("").
   - cnicIdentification extracted and converted to English (e.g. "Nothing").
4. Output structured dictionary containing the required 8 fields:
   - fullName, fatherHusbandName, cnicNumber, gender, dateOfBirth, dateOfIssue, dateOfExpiry, cnicIdentification.
"""

from __future__ import annotations

import re
import logging
from datetime import date
from typing import Any, Callable, Optional
import numpy as np

from .preprocessor import (
    NORMALIZED_WIDTH,
    NORMALIZED_HEIGHT,
    FIELD_REGIONS,
    get_field_crop,
)

logger = logging.getLogger("cnic-ocr.parser")

HEADER_KEYWORDS = {
    "pakistan",
    "national identity card",
    "identity card",
    "islamic republic",
    "republic of pakistan",
    "government of pakistan",
    "holder's signature",
    "signature",
}

LABEL_KEYWORDS = {
    "name",
    "father name",
    "husband name",
    "gender",
    "country of stay",
    "identity number",
    "date of birth",
    "date of issue",
    "date of expiry",
}

# ---------------------------------------------------------------------------
# Urdu Translation & Romanization Dictionary for Pakistani CNICs
# ---------------------------------------------------------------------------
URDU_NAME_MAP = {
    "عمار": "Ammar",
    "احمد": "Ahmed",
    "صدیقی": "Siddiqui",
    "ظفر": "Zafar",
    "محمد": "Muhammad",
    "علی": "Ali",
    "خان": "Khan",
    "حسین": "Hussain",
    "حسن": "Hassan",
    "سید": "Syed",
    "رضا": "Raza",
    "شاہ": "Shah",
    "فاطمہ": "Fatima",
    "عائشہ": "Ayesha",
    "زینب": "Zainab",
    "مریم": "Maryam",
    "عبداللہ": "Abdullah",
    "عبدالرحمن": "Abdul Rehman",
    "بلال": "Bilal",
    "حمزہ": "Hamza",
    "عمر": "Umar",
    "عثمان": "Usman",
    "ابوبکر": "Abubakar",
    "طارق": "Tariq",
    "نوید": "Navid",
    "راشد": "Rashid",
    "ساجد": "Sajid",
    "ماجد": "Majid",
    "ندیم": "Nadeem",
    "وسیم": "Waseem",
    "نعیم": "Naeem",
    "سلیم": "Saleem",
    "کلیم": "Kaleem",
    "فہیم": "Faheem",
    "عاصم": "Asim",
    "قاسم": "Qasim",
    "شاہد": "Shahid",
    "زاہد": "Zahid",
    "خالد": "Khalid",
    "طاہر": "Tahir",
    "ناصر": "Nasir",
    "صابر": "Sabir",
    "شاکر": "Shakir",
    "بشیر": "Bashir",
    "نذیر": "Nazeer",
    "منیر": "Muneer",
    "ظہیر": "Zaheer",
    "اقبال": "Iqbal",
    "انور": "Anwar",
    "اصغر": "Asghar",
    "اکبر": "Akbar",
    "افضل": "Afzal",
    "ارشد": "Arshad",
    "امجد": "Amjad",
    "اشرف": "Ashraf",
    "اکرم": "Akram",
    "اسلم": "Aslam",
    "اعظم": "Azam",
    "اطہر": "Athar",
    "اعجاز": "Aijaz",
    "امتیاز": "Imtiaz",
    "ارسلان": "Arsalan",
    "ادریس": "Idrees",
    "الیاس": "Ilyas",
    "ایوب": "Ayub",
    "یعقوب": "Yaqoob",
    "یوسف": "Yousuf",
    "یونس": "Younus",
    "یاسین": "Yaseen",
    "ہارون": "Haroon",
    "فاروق": "Farooq",
    "زبیر": "Zubair",
    "طلحہ": "Talha",
    "سلمان": "Salman",
    "سلیمان": "Suleman",
    "داؤد": "Daud",
    "ابراہیم": "Ibrahim",
    "اسماعیل": "Ismail",
    "اسحاق": "Ishaq",
    "جہانگیر": "Jahangir",
    "شہزاد": "Shehzad",
    "خرم": "Khurram",
    "کامران": "Kamran",
    "عدنان": "Adnan",
    "عرفان": "Irfan",
    "عمران": "Imran",
    "رضوان": "Rizwan",
    "فرحان": "Farhan",
    "ذیشان": "Zeeshan",
    "ریحان": "Rehan",
    "فیصل": "Faisal",
    "کاشف": "Kashif",
    "عاطف": "Atif",
    "ثاقب": "Saqib",
    "واصف": "Wasif",
    "آصف": "Asif",
    "عارف": "Arif",
    "شریف": "Shareef",
    "لطیف": "Lateef",
    "حنیف": "Haneef",
    "رفیق": "Rafeeq",
    "شفیق": "Shafeeq",
    "مشتاق": "Mushtaq",
    "اشفاق": "Ashfaq",
    "رزاق": "Razzaq",
    "ممتاز": "Mumtaz",
    "سرور": "Sarwar",
    "پرویز": "Pervez",
    "جاوید": "Javed",
    "وحید": "Waheed",
    "سعید": "Saeed",
    "حمید": "Hameed",
    "مجید": "Majeed",
    "رشید": "Rasheed",
    "فرید": "Fareed",
}

URDU_MARKS_MAP = {
    "کوئی نہیں": "Nothing",
    "کوئی نھیں": "Nothing",
    "کوئی نہں": "Nothing",
    "کوئی": "Nothing",
    "چہرے پر تل": "Mole on face",
    "ناک پر تل": "Mole on nose",
    "پیشانی پر تل": "Mole on forehead",
    "گردن پر تل": "Mole on neck",
    "ہاتھ پر تل": "Mole on hand",
    "چہرے پر نشان": "Scar on face",
    "سر پر نشان": "Scar on head",
    "ماتھے پر تل": "Mole on forehead",
    "دائیں گال پر تل": "Mole on right cheek",
    "بائیں گال پر تل": "Mole on left cheek",
}


def translate_urdu_text(urdu_text: str) -> str:
    """Translates or romanizes Urdu name tokens into English."""
    cleaned = urdu_text.strip(" :-،؍/")
    if not cleaned:
        return ""
    if cleaned in URDU_NAME_MAP:
        return URDU_NAME_MAP[cleaned]
    if cleaned in URDU_MARKS_MAP:
        return URDU_MARKS_MAP[cleaned]

    # Token by token
    tokens = re.split(r"[\s\-]+", cleaned)
    translated_tokens = []
    for token in tokens:
        t_clean = token.strip(" :-،؍/")
        if not t_clean:
            continue
        if t_clean in URDU_NAME_MAP:
            translated_tokens.append(URDU_NAME_MAP[t_clean])
        elif t_clean in URDU_MARKS_MAP:
            translated_tokens.append(URDU_MARKS_MAP[t_clean])
        else:
            translated_tokens.append(t_clean)
    if translated_tokens:
        return " ".join(translated_tokens)
    return urdu_text


class BoxItem:
    """Represents a detected OCR text item with coordinates normalized to (0..1)."""

    def __init__(self, item: dict[str, Any], card_w: int = NORMALIZED_WIDTH, card_h: int = NORMALIZED_HEIGHT):
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

    def in_region(self, region_key: str, tol_y: float = 0.04, tol_x: float = 0.04) -> bool:
        """Checks if the center of this box falls inside the specified relative region."""
        ymin, ymax, xmin, xmax = FIELD_REGIONS[region_key]
        return (ymin - tol_y <= self.center_y <= ymax + tol_y) and (xmin - tol_x <= self.center_x <= xmax + tol_x)


# ---------------------------------------------------------------------------
# Card Format Detector
# ---------------------------------------------------------------------------

def detect_cnic_format(boxes: list[BoxItem]) -> str:
    """
    Detects whether card is Smart CNIC ('smart') or Old-format CNIC ('old').

    Smart CNIC features:
      - Has English labels: 'National Identity Card', 'Date of Issue', 'Date of Expiry', 'Identity Number', 'Father Name', 'Name'
      - Multiple dates (DOB, Issue, Expiry) or English person names
    Old CNIC features:
      - Absence of English labels / English names
      - Typically has only one date (Date of Birth) on the front
      - Urdu text / labels
    """
    combined_text = " ".join(b.raw_text.lower() for b in boxes)

    smart_signatures = [
        "date of expiry",
        "date of issue",
        "national identity card",
        "identity number",
        "country of stay",
        "father name",
        "husband name",
        "date of birth",
        "holder's signature",
        "islamic republic",
    ]
    for sig in smart_signatures:
        if sig in combined_text:
            return "smart"

    # Count valid dates
    dates_found = set()
    for b in boxes:
        d = validate_date(b.raw_text)
        if d:
            dates_found.add(d)

    # Smart CNIC has 2-3 distinct dates (DOB, Issue, Expiry)
    if len(dates_found) >= 2:
        return "smart"

    # If Urdu script characters are present without English smart labels, classify as old
    has_urdu = any(re.search(r"[\u0600-\u06FF]", b.raw_text) for b in boxes)
    if has_urdu:
        return "old"

    # An old Urdu card often produces plausible-looking English OCR noise.
    # A real identity number with only its DOB and no smart-card labels must
    # not become a smart card just because that noise contains multiple words.
    if any(validate_cnic(b.raw_text) for b in boxes) and len(dates_found) <= 1:
        return "old"

    # If there are valid multi-word English name lines, default to smart CNIC
    for b in boxes:
        cleaned = clean_name_string(b.raw_text)
        if is_valid_name(cleaned) and len(cleaned.split()) >= 2:
            return "smart"

    return "old"


# ---------------------------------------------------------------------------
# Field Validators
# ---------------------------------------------------------------------------

def validate_date(text: str) -> str:
    """Normalizes DD.MM.YYYY, DD-MM-YYYY, or DD/MM/YYYY into YYYY-MM-DD."""
    if not text:
        return ""
    # Look for DD.MM.YYYY, DD-MM-YYYY, DD/MM/YYYY (even if adjacent to punctuation/letters)
    m = re.search(r"(?<!\d)(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})(?!\d)", text)
    if m:
        d, mth, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            if 1900 <= y <= 2100:
                return date(y, mth, d).isoformat()
        except ValueError:
            pass

    # Look for YYYY-MM-DD
    m_ymd = re.search(r"(?<!\d)(\d{4})[\.\/\-](\d{1,2})[\.\/\-](\d{1,2})(?!\d)", text)
    if m_ymd:
        y, mth, d = int(m_ymd.group(1)), int(m_ymd.group(2)), int(m_ymd.group(3))
        try:
            if 1900 <= y <= 2100:
                return date(y, mth, d).isoformat()
        except ValueError:
            pass

    return ""


def _normalize_ocr_digit_token(token: str) -> str:
    """Normalizes common OCR digit confusions inside numeric/CNIC tokens."""
    trans = str.maketrans({
        "O": "0", "o": "0", "Q": "0",
        "I": "1", "l": "1", "|": "1",
        "S": "5", "B": "8",
    })
    return token.translate(trans)


def validate_cnic(text: str) -> str:
    """Validates and formats a 13-digit Pakistani CNIC as XXXXX-XXXXXXX-X."""
    if not text:
        return ""

    # 1. Direct match for 5-7-1 pattern (with hyphen, space, dot, or underscore)
    m = re.search(r"(?<!\d)(\d{5})[\-\.\s–—_]*(\d{7})[\-\.\s–—_]*(\d{1})(?!\d)", text)
    if m and m.group(1)[0] in "1234567":
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"

    # 2. Try normalizing OCR letter-for-digit confusions when hyphenated structure exists
    if "-" in text or " " in text:
        norm_text = _normalize_ocr_digit_token(text)
        m_norm = re.search(r"(?<!\d)(\d{5})[\-\.\s–—_]+(\d{7})[\-\.\s–—_]+(\d{1})(?!\d)", norm_text)
        if m_norm and m_norm.group(1)[0] in "1234567":
            return f"{m_norm.group(1)}-{m_norm.group(2)}-{m_norm.group(3)}"

    # 3. Strip non-digits if exact 13 digits starting with valid province digit (1..7)
    digits = re.sub(r"\D", "", text)
    if len(digits) == 13 and digits[0] in "1234567":
        return f"{digits[:5]}-{digits[5:12]}-{digits[12]}"

    return ""


def validate_gender(text: str) -> str:
    """Maps M/F/Male/Female to 'Male' or 'Female'."""
    clean = text.strip()
    lower = clean.lower()

    if lower in {"m", "male"} or re.search(r"\b[mM]\b", clean):
        return "Male"
    if lower in {"f", "female"} or re.search(r"\b[fF]\b", clean):
        return "Female"
    return ""


def validate_country(text: str) -> str:
    """Validates and normalizes Country of Stay to 'Pakistan'."""
    lower = text.strip().lower()
    if any(k in lower for k in ["pakistan", "pakis", "akistan", "pak"]):
        if "islamic" in lower or "republic" in lower:
            return ""
        return "Pakistan"
    return ""


def clean_name_string(text: str) -> str:
    """Cleans up names, removing trailing noise and labels."""
    cleaned = text.strip()
    for prefix in [
        "Father / Husband Name:", "Father / Husband Name",
        "Father Name:", "Father Name", "Father:", "Father",
        "Husband Name:", "Husband Name", "Husband:",
        "Full Name:", "Full Name", "Name:", "Name",
    ]:
        if cleaned.lower().startswith(prefix.lower()):
            cleaned = cleaned[len(prefix):].strip(" :-.")

    # Remove non-alphabetical noise
    cleaned = re.sub(r"[^A-Za-z\s\.\-']", "", cleaned).strip(" .-")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def is_valid_name(text: str) -> bool:
    """Validates that a string is a human name candidate."""
    cleaned = clean_name_string(text)
    if len(cleaned) < 3:
        return False
    lower = cleaned.lower()
    if lower in LABEL_KEYWORDS or lower in {"male", "female", "pakistan", "smart", "card", "date", "birth", "issue", "expiry", "number", "identity"}:
        return False
    for kw in HEADER_KEYWORDS:
        if kw in lower:
            return False
    for kw in LABEL_KEYWORDS:
        if kw in lower:
            return False
    words = [w for w in cleaned.split() if len(w) > 1]
    return len(words) >= 1


# ---------------------------------------------------------------------------
# Smart CNIC Field Extractors (Pass 1 & Crop OCR)
# ---------------------------------------------------------------------------

def extract_from_boxes(boxes: list[BoxItem], field_key: str, exclude_texts: Optional[set[str]] = None) -> str:
    """Extracts field value from bounding boxes inside the field's relative region, with global label/format fallbacks."""
    exclude = {t.lower() for t in (exclude_texts or set()) if t}
    candidates = [b for b in boxes if b.in_region(field_key)]

    if field_key == "cnic":
        # 1. Check region candidates first
        for b in candidates:
            res = validate_cnic(b.raw_text)
            if res:
                return res
        combined = " ".join(b.raw_text for b in candidates)
        res = validate_cnic(combined)
        if res:
            return res

        # 2. Fallback: scan ALL boxes across the card (handles shifted/zoomed-out cards)
        for b in boxes:
            res = validate_cnic(b.raw_text)
            if res:
                return res
        all_combined = " ".join(b.raw_text for b in boxes)
        res = validate_cnic(all_combined)
        if res:
            return res

    elif field_key in {"dob", "issue", "expiry"}:
        for b in candidates:
            res = validate_date(b.raw_text)
            if res and res.lower() not in exclude:
                return res

    elif field_key == "gender":
        # Check near 'Gender' label first
        gender_label = next((b for b in boxes if "gender" in b.raw_text.lower()), None)
        if gender_label:
            near_gender = [
                b for b in boxes
                if b is not gender_label
                and 0 <= (b.center_y - gender_label.center_y) <= 0.14
                and abs(b.center_x - gender_label.center_x) <= 0.22
            ]
            for b in near_gender:
                res = validate_gender(b.raw_text)
                if res:
                    return res
        for b in candidates:
            if "gender" in b.raw_text.lower():
                continue
            res = validate_gender(b.raw_text)
            if res:
                return res

    elif field_key == "country":
        for b in candidates:
            if "country" in b.raw_text.lower() or "stay" in b.raw_text.lower():
                continue
            res = validate_country(b.raw_text)
            if res:
                return res
        for b in boxes:
            if "country" in b.raw_text.lower() or "stay" in b.raw_text.lower():
                continue
            res = validate_country(b.raw_text)
            if res:
                return res

    elif field_key == "name":
        # 1. Prioritize label-anchored match: box immediately below 'Name' label (not 'Father Name')
        name_label = next(
            (
                b for b in boxes
                if re.match(r"^name\b", b.raw_text.strip(), re.IGNORECASE)
                and "father" not in b.raw_text.lower()
                and "husband" not in b.raw_text.lower()
            ),
            None,
        )
        if name_label:
            # Check if name is inline inside the same box e.g. "Name Muhammad Mehmood Asim"
            inline_clean = clean_name_string(name_label.raw_text)
            if is_valid_name(inline_clean) and inline_clean.lower() not in exclude:
                return inline_clean

            below_cands = [
                b for b in boxes
                if b is not name_label
                and 0 < (b.center_y - name_label.center_y) <= 0.16
                and abs(b.center_x - name_label.center_x) < 0.45
            ]
            below_cands.sort(key=lambda b: b.center_y)
            for b in below_cands:
                if "father" in b.raw_text.lower() or "husband" in b.raw_text.lower():
                    continue
                cleaned = clean_name_string(b.raw_text)
                if is_valid_name(cleaned) and cleaned.lower() not in exclude:
                    return cleaned

        for b in candidates:
            if "father" in b.raw_text.lower() or "husband" in b.raw_text.lower() or b.raw_text.strip().lower() == "name":
                continue
            cleaned = clean_name_string(b.raw_text)
            if is_valid_name(cleaned) and cleaned.lower() not in exclude:
                return cleaned

    elif field_key == "father_name":
        # 1. Prioritize label-anchored match: box immediately below 'Father Name' or 'Husband Name' label
        father_label = next(
            (b for b in boxes if "father" in b.raw_text.strip().lower() or "husband" in b.raw_text.strip().lower()),
            None,
        )
        if father_label:
            inline_clean = clean_name_string(father_label.raw_text)
            if is_valid_name(inline_clean) and inline_clean.lower() not in exclude:
                return inline_clean

            below_cands = [
                b for b in boxes
                if b is not father_label
                and 0 < (b.center_y - father_label.center_y) <= 0.16
                and abs(b.center_x - father_label.center_x) < 0.45
            ]
            below_cands.sort(key=lambda b: b.center_y)
            for b in below_cands:
                cleaned = clean_name_string(b.raw_text)
                if is_valid_name(cleaned) and cleaned.lower() not in exclude:
                    return cleaned

        for b in candidates:
            cleaned = clean_name_string(b.raw_text)
            if is_valid_name(cleaned) and cleaned.lower() not in exclude:
                return cleaned

    return ""


def _resolve_smart_dates(boxes: list[BoxItem]) -> tuple[str, str, str]:
    """
    Resolves (dateOfBirth, dateOfIssue, dateOfExpiry) using label anchors first,
    then spatial position and chronological order (DOB < Issue < Expiry).
    """
    dob = ""
    issue = ""
    expiry = ""
    used_dates: set[str] = set()

    # Collect all boxes containing valid dates
    date_boxes: list[tuple[str, BoxItem]] = []
    for b in boxes:
        d = validate_date(b.raw_text)
        if d:
            date_boxes.append((d, b))

    if not date_boxes:
        return "", "", ""

    def find_below_label(keywords: list[str]) -> str:
        lbl = next(
            (b for b in boxes if any(k in b.raw_text.lower() for k in keywords)),
            None,
        )
        if not lbl:
            return ""
        # Check inline first
        inline_d = validate_date(lbl.raw_text)
        if inline_d and inline_d not in used_dates:
            used_dates.add(inline_d)
            return inline_d
        # Find nearest date box below or to the right of label
        cands = [
            (d, b) for (d, b) in date_boxes
            if d not in used_dates
            and -0.02 <= (b.center_y - lbl.center_y) <= 0.16
            and abs(b.center_x - lbl.center_x) <= 0.25
        ]
        if cands:
            cands.sort(key=lambda item: abs(item[1].center_y - lbl.center_y) + abs(item[1].center_x - lbl.center_x))
            chosen = cands[0][0]
            used_dates.add(chosen)
            return chosen
        return ""

    dob = find_below_label(["date of birth", "birth"])
    issue = find_below_label(["date of issue", "issue"])
    expiry = find_below_label(["date of expiry", "expiry"])

    # Collect distinct chronological dates for fallback assignment
    unique_dates = sorted({d for d, _ in date_boxes})
    if len(unique_dates) >= 3 and (not dob or not issue or not expiry):
        # On a Pakistani Smart CNIC with 3 dates, chronological order is always DOB < Issue < Expiry
        if not dob:
            dob = unique_dates[0]
        if not issue:
            issue = unique_dates[1]
        if not expiry:
            expiry = unique_dates[-1]
    # A year alone cannot establish whether a date is DOB, issue or expiry.
    # With fewer dates retain label evidence and let spatial extraction/review
    # handle missing fields instead of hardcoded year cutoffs.

    return dob, issue, expiry


def extract_from_crop_ocr(crop_ocr_result: dict[str, Any], field_key: str) -> str:
    """Parses text items returned by targeted crop OCR for a specific field."""
    text_items = crop_ocr_result.get("text", [])

    if field_key == "cnic":
        for text in text_items:
            res = validate_cnic(text)
            if res:
                return res
        combined = " ".join(text_items)
        return validate_cnic(combined)

    elif field_key in {"dob", "issue", "expiry"}:
        for text in text_items:
            res = validate_date(text)
            if res:
                return res

    elif field_key == "gender":
        for text in text_items:
            if "gender" in text.lower():
                continue
            res = validate_gender(text)
            if res:
                return res

    elif field_key == "country":
        for text in text_items:
            res = validate_country(text)
            if res:
                return res

    elif field_key in {"name", "father_name"}:
        for text in text_items:
            cleaned = clean_name_string(text)
            if is_valid_name(cleaned):
                return cleaned

    return ""


def parse_smart_cnic_fields(
    normalized_card: np.ndarray,
    boxes: list[BoxItem],
    ocr_runner: Optional[Callable[[np.ndarray], dict[str, Any]]] = None,
) -> dict[str, str]:
    """Parses all 8 required fields for Pakistani Smart CNIC (chip card)."""
    name_val = extract_from_boxes(boxes, "name")
    father_val = extract_from_boxes(boxes, "father_name", exclude_texts={name_val} if name_val else None)

    # Fallback for shifted/zoomed-out cards where name/fatherName fell outside default FIELD_REGIONS
    if not name_val or not father_val:
        name_boxes: list[tuple[float, str]] = []
        for b in boxes:
            low = b.raw_text.strip().lower()
            if any(lbl in low for lbl in ["father", "husband", "gender", "country", "identity", "birth", "issue", "expiry", "signature", "pakistan", "national"]):
                continue
            cleaned = clean_name_string(b.raw_text)
            if is_valid_name(cleaned) and len(cleaned) >= 4:
                name_boxes.append((b.center_y, cleaned))
        name_boxes.sort(key=lambda item: item[0])
        distinct_names: list[str] = []
        for _, cand in name_boxes:
            if cand.lower() not in {n.lower() for n in distinct_names}:
                distinct_names.append(cand)
        if not name_val and len(distinct_names) >= 1:
            name_val = distinct_names[0]
        if not father_val:
            for cand in distinct_names:
                if cand.lower() != (name_val or "").lower():
                    father_val = cand
                    break

    dob_val, issue_val, expiry_val = _resolve_smart_dates(boxes)
    cnic_val = extract_from_boxes(boxes, "cnic")
    gender_val = extract_from_boxes(boxes, "gender")
    country_val = extract_from_boxes(boxes, "country")

    extracted: dict[str, str] = {
        "name": name_val,
        "fatherName": father_val,
        "gender": gender_val,
        "countryOfStay": country_val,
        "cnic": cnic_val,
        "dateOfBirth": dob_val or extract_from_boxes(boxes, "dob"),
        "dateOfIssue": issue_val or extract_from_boxes(boxes, "issue", exclude_texts={dob_val}),
        "dateOfExpiry": expiry_val or extract_from_boxes(boxes, "expiry", exclude_texts={dob_val, issue_val}),
    }

    # Pass 2: Targeted crop OCR only for key fields still missing
    key_mapping = {
        "cnic": "cnic",
        "name": "name",
        "fatherName": "father_name",
        "dateOfBirth": "dob",
    }

    if ocr_runner is not None:
        for field_name, region_key in key_mapping.items():
            if not extracted[field_name]:
                logger.info("Running targeted OCR for missing Smart CNIC field: %s", field_name)
                try:
                    crop = get_field_crop(normalized_card, region_key, margin_px=12)
                    if crop.size > 0:
                        crop_result = ocr_runner(crop)
                        val = extract_from_crop_ocr(crop_result, region_key)
                        if val and (field_name != "fatherName" or val.lower() != extracted["name"].lower()):
                            extracted[field_name] = val
                            logger.info("Successfully recovered %s: %s", field_name, val)
                except Exception as e:
                    logger.warning("Targeted OCR failed for %s: %s", field_name, e)

    # Derive Gender from NADRA CNIC last digit (odd = Male, even = Female) if not read from box
    if not extracted["gender"] and extracted["cnic"]:
        last_digit = extracted["cnic"][-1]
        if last_digit.isdigit():
            extracted["gender"] = "Male" if int(last_digit) % 2 != 0 else "Female"

    if not extracted["countryOfStay"] and (extracted["cnic"] or extracted["name"]):
        extracted["countryOfStay"] = "Pakistan"

    # Smart CNIC front has no identification mark -> empty string
    extracted["cnicIdentification"] = ""

    # Aliases
    extracted["fullName"] = extracted["name"]
    extracted["fatherHusbandName"] = extracted["fatherName"]
    extracted["cnicNumber"] = extracted["cnic"]

    return extracted


# ---------------------------------------------------------------------------
# Old-format CNIC Field Extractor
# ---------------------------------------------------------------------------

def parse_old_cnic_fields(
    normalized_card: np.ndarray,
    boxes: list[BoxItem],
    ocr_runner: Optional[Callable[[np.ndarray], dict[str, Any]]] = None,
) -> dict[str, str]:
    """
    Parses fields for Old-format Pakistani CNIC:
    - fullName (Urdu translated to English)
    - fatherHusbandName (Urdu translated to English)
    - cnicNumber (XXXXX-XXXXXXX-X)
    - gender (Male/Female derived from CNIC last digit & visual cues)
    - dateOfBirth (YYYY-MM-DD)
    - dateOfIssue: "" (empty string)
    - dateOfExpiry: "" (empty string)
    - cnicIdentification: English translated identification mark (e.g. "Nothing")
    """
    extracted: dict[str, str] = {
        "fullName": "",
        "fatherHusbandName": "",
        "cnicNumber": "",
        "gender": "",
        "dateOfBirth": "",
        "dateOfIssue": "",
        "dateOfExpiry": "",
        "cnicIdentification": "",
    }

    # 1. CNIC Number: Standard Pakistani 13-digit format
    for b in boxes:
        val = validate_cnic(b.raw_text)
        if val:
            extracted["cnicNumber"] = val
            break

    # If missing, search all combined numbers
    if not extracted["cnicNumber"]:
        combined = "".join(b.raw_text for b in boxes)
        val = validate_cnic(combined)
        if val:
            extracted["cnicNumber"] = val

    # 2. Gender: Official NADRA numbering rule:
    # Odd last digit = Male, Even last digit = Female
    if extracted["cnicNumber"]:
        last_digit = extracted["cnicNumber"][-1]
        if last_digit.isdigit():
            extracted["gender"] = "Male" if int(last_digit) % 2 != 0 else "Female"

    # Also check visual text in gender region (relative y: 0.50 - 0.62)
    for b in boxes:
        if 0.50 <= b.center_y <= 0.62 and b.center_x > 0.45:
            if "مرد" in b.raw_text:
                extracted["gender"] = "Male"
            elif "عورت" in b.raw_text:
                extracted["gender"] = "Female"

    # 3. Date of Birth: Old CNIC only has DOB on the front (relative y: ~0.70 - 0.88)
    for b in boxes:
        val = validate_date(b.raw_text)
        if val:
            extracted["dateOfBirth"] = val
            break

    # 4. CNIC Identification Mark: (relative y: 0.64 - 0.78, x: 0.35 - 0.85)
    id_mark = ""
    for b in boxes:
        if 0.64 <= b.center_y <= 0.78 and 0.40 <= b.center_x <= 0.85:
            text = b.raw_text
            if any(k in text for k in ["کوئی نہیں", "کوئی نھیں", "کوئی نہں"]):
                id_mark = "Nothing"
                break
            elif "تل" in text or "نشان" in text:
                id_mark = translate_urdu_text(text)
                break
    extracted["cnicIdentification"] = id_mark

    # 5. Full Name & Father Name:
    # On Old CNIC:
    # Name is at relative y: 0.40 - 0.53, x: 0.35 - 0.85
    # Father Name is at relative y: 0.56 - 0.68, x: 0.35 - 0.85
    # English OCR noise, a birth date or an identity number cannot establish a
    # person's Urdu name. Only actually recognized Urdu text is accepted here.
    def urdu_name(ymin: float, ymax: float) -> str:
        candidates = [b for b in boxes if ymin <= b.center_y <= ymax
                      and 0.35 <= b.center_x <= 0.85
                      and b.confidence >= 0.85 and re.search(r"[\u0600-\u06ff]", b.raw_text)]
        candidates.sort(key=lambda b: (b.center_y, -b.center_x))
        native = " ".join(b.raw_text for b in candidates)
        native = re.sub(r"(?:والد(?:\s*کا)?\s*نام|شوہر(?:\s*کا)?\s*نام|نام)\s*[:：]?", "", native).strip()
        return translate_urdu_text(native)

    extracted["fullName"] = urdu_name(0.40, 0.53)
    extracted["fatherHusbandName"] = urdu_name(0.56, 0.68)

    # Date of Issue & Expiry are strictly empty for Old CNIC
    extracted["dateOfIssue"] = ""
    extracted["dateOfExpiry"] = ""

    # Aliases
    extracted["name"] = extracted["fullName"]
    extracted["fatherName"] = extracted["fatherHusbandName"]
    extracted["cnic"] = extracted["cnicNumber"]
    extracted["countryOfStay"] = "Pakistan" if extracted["cnicNumber"] else ""

    return extracted


# ---------------------------------------------------------------------------
# Main Orchestrator: Smart vs Old Format Routing
# ---------------------------------------------------------------------------

def parse_cnic_fields(
    normalized_card: np.ndarray,
    pass1_ocr_results: list[dict[str, Any]],
    ocr_runner: Optional[Callable[[np.ndarray], dict[str, Any]]] = None,
) -> dict[str, str]:
    """
    Parses all 8 required CNIC fields:
    - fullName (or name)
    - fatherHusbandName (or fatherName)
    - cnicNumber (or cnic)
    - gender
    - dateOfBirth
    - dateOfIssue
    - dateOfExpiry
    - cnicIdentification

    Automatically detects whether the card is a Smart CNIC or an Old CNIC,
    and dispatches to the appropriate parser.
    """
    card_h, card_w = normalized_card.shape[:2]
    boxes = [BoxItem(item, card_w=card_w, card_h=card_h) for item in pass1_ocr_results]

    card_format = detect_cnic_format(boxes)
    logger.info("Detected CNIC format: %s", card_format)

    if card_format == "old":
        return parse_old_cnic_fields(normalized_card, boxes, ocr_runner)

    return parse_smart_cnic_fields(normalized_card, boxes, ocr_runner)
