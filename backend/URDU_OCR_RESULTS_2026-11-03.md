# Old CNIC Urdu recognition and offline English names — 0.3.4

Deployed to https://gateshield.pro on 2026-11-03. Identity image inference stays
on the existing VPS. No cloud OCR, external translation API or new paid service.

## What changed

The detector could merge the identity-number line with a name polygon. Checking
only the polygon's centre did not prevent neighbouring pixels reaching the name
recognizer. Old-card crops now intersect the actual name/father-name regions.
In the private clipped-crop probe, all nine nonblank source readings were textually
correct; one was below the acceptance gate and therefore still needs review.

The two isolated rows are read in Urdu by the existing local Qwen3-VL worker.
Both fields use a 0.80 token-score review gate after the crop fix; the previous
father-only 0.90 gate was rejecting correct readings. These scores are **not
calibrated probabilities of name accuracy**. All old cards still require review.
Low-detail captures, absent rows, invalid responses and weak readings remain
empty rather than being filled from a sample identity.

Only after the final card/orientation is selected, recognized Urdu is converted
to English spelling suggestions. Common individual name tokens use the existing
general name lexicon. Unseen tokens use AI4Bharat IndicXlit v1.0, exported to
ONNX, with a conservative letter/sound alignment check. No CNIC number, date of
birth or whole-person identity lookup enters this conversion stage. A failed
word makes the whole English field require manual spelling; name parts are not
silently dropped. English source names pass through unchanged.

`nameUrdu` and `fatherNameUrdu` retain the recognized source. Both admin and
operator forms show that Urdu below editable English fields. The source metadata
is for scan review; existing record storage continues saving the reviewed name
and document image. No database schema migration was needed.

Smart CNIC and driving-licence scans bypass both old-card name recognition and
transliteration. Front-side old-CNIC issue/expiry dates stay empty.

## Verification and measured speed

* 45 unit checks passed on the PC (synthetic/mocked inputs) and VPS.
* Frontend TypeScript and production webpack build passed.
* 49 real candidate API checks passed: three repeats of six original fixtures,
  rotated/dark/compressed/blurred variants, invalid/oversized/blank uploads,
  wrong-document handling, and health responsiveness during concurrent scans.
* Original old-card names matched both Urdu source fields and both English
  suggestions on all three repeats. Its identification mark still needs manual
  review. The two blank front-side dates are not counted as OCR-read fields.
* Seven additional old-card stress cases all passed the no-wrong-name/review
  checks. **Four of seven had both names exact**: changed-name sample 2,
  previously unseen-name sample, blank-name sample, and darker original.
  Changed-name sample 1 needed manual father-name entry; the 1200-pixel capture
  needed both names entered or a closer retake; rotated/re-encoded original
  needed manual full-name entry. A safety pass is not an exact-name pass.
* Thirteen actual application/auth/OCR checks passed on the candidate and again
  through public HTTPS, including the original old-card English and Urdu fields.
* Actual mobile-operator and desktop-admin browser tests checked API-to-visible
  English names, original Urdu text, and editable English spelling. Tests did
  not submit visitor records. Temporary accounts were removed afterwards.

Three additional uncached sequential scans, after the build finished, measured:

| Original fixture | Median API wall time | Urdu-name work | English conversion |
|---|---:|---|---|
| Smart CNIC | 2.354 s | Not called | Not called |
| Newer driving licence | 1.932 s | Not called | Not called |
| Old Urdu CNIC | 9.104 s | Two source rows | Common-token path <1 ms |

The unknown-token ONNX path was also exercised with changed Urdu names. A
separate warm conversion probe measured roughly 0.04–0.10 s per unseen token;
first model loading took around one second on the development CPU. This is not
an OCR speed measurement or VPS latency SLA. Build-time contention produced
much slower requests, so those runs were not used for the speed table.

Evidence remains private on the VPS under
`/opt/gateshield/backups/20261103-urdu-research/`: candidate-acceptance.json,
candidate-old-stress.json, fair-speed.json, candidate-application.json and
public-application.json. Deployment configuration rollback is under
`/opt/gateshield/backups/20261103-v034-deployment/`; it restores service units
to the previous retained releases without reverting database records or DNS.

## Research and code review

| Public implementation | Finding on these tests | Decision |
|---|---|---|
| [PaddleOCR-VL 1.6](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6-GGUF) | Several wrong letters in actual old-card name crops despite general Urdu support | Kept out of production |
| [EasyOCR](https://github.com/JaidedAI/EasyOCR) | Fast, but Urdu name letters/spacing were unreliable on these crops | Kept out |
| [Urdu CRNN](https://github.com/hassan-mhrq/Urdu_OCR_Project_R) | MIT line/word weights tested with raw, normalized and binary images; many incorrect readings | Kept out |
| [Urdu TrOCR](https://huggingface.co/qandeelasim13/urdu-ocr-trocr-si26) | Earlier six-variant probe was slow and inaccurate on this card | Kept out |
| [UTRNet](https://github.com/abdur75648/UTRNet-High-Resolution-Urdu-Text-Recognition) | Relevant Nastaliq architecture, but noncommercial terms | Not deployed |
| [Qwen3.5-2B](https://huggingface.co/unsloth/Qwen3.5-2B-GGUF) | Bare text conversion changed a source name into a different name | Not used for name conversion |
| [IndicXlit](https://github.com/AI4Bharat/IndicXlit) | Dedicated Urdu-to-Latin model; MIT code/weights, compact CPU inference | Selected with conventional-token spellings and alignment checks |

The ONNX export matches the reviewed Torch inference logits within 0.000012 on
three numeric variable-length/batch checks. Runtime reuses existing ONNX Runtime;
Torch/Fairseq are export-only research dependencies. See `tools/README.md` for
reproduction, source-archive hash and model provisioning, and `third_party/` for
license notices. Runtime model assets are outside the checkout, read-only for
the application. No second language-model worker is required for conversion.

## Limits

This test set contains **one real old CNIC** plus synthetic changed-name and
image-quality variants. It establishes a working fix on that evidence, not a
population-wide Urdu accuracy percentage. Clear Urdu has multiple legitimate
English spellings; an Urdu-only card cannot establish the holder's official
English spelling. Verify that suggestion before saving. New phone captures,
glare, worn cards, other layouts and handwriting need broader real-card testing.
Old-card latency on this CPU remains around nine seconds for the clean sample;
this change does not make old-card recognition a two-second operation.

Public browser verification measured old-card backend processing at 9.950 s
(mobile operator) and 14.768 s (desktop admin), alongside the release checks.
Observed live latency therefore varies; the idle sequential median above is
not a promise that every scan completes in nine seconds.
