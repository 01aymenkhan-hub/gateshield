"""Offline Urdu name transliteration, never identity lookup or translation.

Common name *tokens* use conventional spellings; unseen tokens use IndicXlit
(MIT) through ONNX Runtime. No images, CNIC numbers or dates enter this module.
Every result remains a spelling suggestion, not an official English identity.
"""
from __future__ import annotations

from functools import lru_cache
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import time
import unicodedata

import numpy as np

from .parser import URDU_NAME_MAP

logger = logging.getLogger("cnic-ocr.transliteration")


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).translate(str.maketrans({"ي": "ی", "ك": "ک", "ى": "ی"}))
    return "".join(c for c in text if not unicodedata.combining(c)).strip()


# Conservative alignment: written long vowels/consonants must survive. Urdu
# omits short vowels, so those can be inserted between letters. This rejects
# deleted/added name parts and unrelated LLM guesses, but cannot prove spelling.
SOUNDS = {
    "ا": ("a", "aa"), "آ": ("a", "aa"), "ع": ("", "a"),
    "ب": ("b", "bb"), "پ": ("p", "pp"), "ت": ("t", "tt"), "ٹ": ("t", "tt"),
    "ث": ("s", "ss", "th"), "ج": ("j", "jj"), "چ": ("ch",), "ح": ("h", "hh"),
    "خ": ("kh",), "د": ("d", "dd"), "ڈ": ("d", "dd"), "ذ": ("z", "zz", "dh"),
    "ر": ("r", "rr"), "ڑ": ("r", "rr"), "ز": ("z", "zz"), "ژ": ("zh",),
    "س": ("s", "ss"), "ش": ("sh",), "ص": ("s", "ss"), "ض": ("z", "zz", "d"),
    "ط": ("t", "tt"), "ظ": ("z", "zz"), "غ": ("gh",), "ف": ("f", "ff", "ph"),
    "ق": ("q", "qq", "k"), "ک": ("k", "kk"), "گ": ("g", "gg"), "ل": ("l", "ll"),
    "م": ("m", "mm"), "ن": ("n", "nn"), "ں": ("n", ""), "ہ": ("h", ""), "ه": ("h", ""),
    "ھ": ("h",), "ی": ("i", "ee", "e", "y", "ai", "ay", "ei"),
    "ے": ("e", "ay", "ai"), "و": ("w", "v", "u", "oo", "o", "au", "ou"),
    "ئ": ("y", "i", "ai", ""), "ؤ": ("u", "oo", "o", "w"), "ء": ("", "a"),
}


def faithful_token(source: str, candidate: str) -> bool:
    source = normalize(source)
    if not source or len(source) > 40 or not re.fullmatch(r"[A-Za-z]{1,64}", candidate):
        return False
    target = candidate.lower()
    positions = {0}
    for index, letter in enumerate(source):
        sounds = SOUNDS.get(letter, ())
        if index == 0 and letter in "اع":
            sounds = ("", "a", "aa", "e", "i", "o", "u")
        next_positions = set()
        # Insert unwritten short vowels, never extra consonants or a new part.
        vowels = ("",) if index == 0 else ("", "a", "e", "i", "o", "u", "aa", "ee", "oo")
        for position in positions:
            for vowel in vowels:
                for sound in sounds:
                    piece = vowel + sound
                    if target.startswith(piece, position):
                        next_positions.add(position + len(piece))
        positions = next_positions
        if not positions:
            return False
    return len(target) in positions


@lru_cache(maxsize=1)
def _model():
    import onnxruntime as ort
    root = Path(os.environ.get("OCR_TRANSLITERATION_DIR", ""))
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    for name in ("encoder.onnx", "decoder.onnx", "vocabulary.json"):
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != manifest["files"][name]:
            raise ValueError("Transliteration model checksum mismatch")
    vocab = json.loads((root / "vocabulary.json").read_text(encoding="utf-8"))
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    return (ort.InferenceSession(str(root / "encoder.onnx"), options, providers=["CPUExecutionProvider"]),
            ort.InferenceSession(str(root / "decoder.onnx"), options, providers=["CPUExecutionProvider"]),
            {token: index for index, token in enumerate(vocab["source"])}, vocab["target"])


@lru_cache(maxsize=512)
def transliterate_token(token: str) -> tuple[str, str]:
    token = normalize(token)
    if token in URDU_NAME_MAP:
        return URDU_NAME_MAP[token], "conventional_spelling"
    if not token or len(token) > 32 or any(c not in SOUNDS for c in token):
        return "", "unsupported_letters"
    encoder, decoder, source_ids, target_vocab = _model()
    if any(c not in source_ids for c in token):
        return "", "unsupported_letters"
    source = np.array([[source_ids["__ur__"]] + [source_ids[c] for c in token] + [2]], dtype=np.int64)
    encoded = encoder.run(None, {"source": source})[0]
    beams = [([2], 0.0, False)]
    for _ in range(min(40, len(token) * 3 + 8)):
        active = [beam for beam in beams if not beam[2]]
        if not active:
            break
        # All live paths have equal length, so decode the beam as one batch.
        batch = len(active)
        logits = decoder.run(None, {"target": np.array([b[0] for b in active], dtype=np.int64),
                                   "source": np.repeat(source, batch, axis=0),
                                   "encoded": np.repeat(encoded, batch, axis=0)})[0]
        logits = logits - logits.max(axis=1, keepdims=True)
        probabilities = logits - np.log(np.exp(logits).sum(axis=1, keepdims=True))
        probabilities[:, [0, 1, 3]] = -np.inf
        candidates = [b for b in beams if b[2]]
        for (sequence, score, _), probs in zip(active, probabilities):
            for index in np.argsort(probs)[-4:]:
                if int(index) != 2 and not re.fullmatch("[a-z]", target_vocab[int(index)]):
                    continue
                candidates.append((sequence + [int(index)], score + float(probs[index]), int(index) == 2))
        beams = sorted(candidates, key=lambda b: b[1] / max(1, len(b[0]) - 1), reverse=True)[:4]
    for sequence, score, finished in beams:
        candidate = "".join(target_vocab[i] for i in sequence[1:] if i != 2)
        if finished and score / (len(sequence) - 1) >= -1.5 and faithful_token(token, candidate):
            return candidate.capitalize(), "indicxlit"
    return "", "uncertain_transliteration"


def english_names(parsed: dict) -> dict:
    """Mutate final old-card fields only; retain Urdu even on conversion failure."""
    start = time.perf_counter()
    status = {}
    warnings = []
    for field, native_field in (("name", "nameUrdu"), ("fatherName", "fatherNameUrdu")):
        native = normalize(parsed.get(field, ""))
        if not native or native.isascii():
            status[field] = "source_english" if native else "not_read"
            continue
        parsed[native_field] = native
        try:
            tokens = [transliterate_token(token) for token in native.split()]
            value = " ".join(token[0] for token in tokens) if all(token[0] for token in tokens) else ""
            status[field] = "suggested" if value else "manual_spelling_required"
        except Exception:
            # ONNX Runtime has its own exception classes as well as IO errors.
            # Preserve readable source text if conversion cannot run.
            logger.warning("Offline name transliteration unavailable; manual spelling required")
            value = ""
            status[field] = "model_unavailable"
        parsed[field] = value
        if not value:
            warnings.append("Enter the English spelling for the Urdu name shown below the field.")
    if any(value == "suggested" for value in status.values()):
        warnings.append("English names are transliteration suggestions. Verify the person's preferred official spelling.")
    return {"status": status, "warnings": warnings, "durationMs": round((time.perf_counter() - start) * 1000, 2)}
