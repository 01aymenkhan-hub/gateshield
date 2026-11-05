# Native-script OCR and camera performance — 2 November 2026

Release 0.3.3 follows the user's revised requirement: preserve the name's source
script. Urdu names remain Urdu; English names remain English. Translation,
transliteration, token-name dictionaries and sample identity lookups are not used.

## Findings and changes

Actual mobile-camera logs showed 2160-pixel captures with low-confidence or
invalid name readings. This was not simply an upload-width rejection. Failed
production images were not retained, so their exact blur/lighting cannot be
reconstructed. We do not claim to have reproduced every physical-phone failure.

Browser tests separately reproduced a camera resource leak: repeated review
cycles retained 1, 2 and 3 live streams; closing left two streams running. The
fixed build retained zero during all three reviews and zero after closing.
Delayed camera permission followed by closing also left zero active streams.
Its contribution to any particular recognition failure is unproven.

The camera now uses a lightweight preview and native sensor stills where
supported, bounded video fallback and an explicit “Use phone camera” option.
Normal supported photos within upload/pixel limits retain their original bytes.
An experiment that always resized the original to 4096 pixels misread Ammar as
Umar; it was rejected. Cropped sensor captures retain up to 2600 pixels of native
width. No fake upscaling bypasses the old-card detail requirement. Both forms
display Urdu right-to-left and English left-to-right automatically.

Name recognition makes at most two image-model calls. The original per-row
prompt was retained. Six vision threads improved warm CPU timings on this
six-core VPS; ONNX stays at four. Invalid placeholders, labels and low-confidence
readings are rejected. Recognition of both names being unavailable remains a
retryable 503; genuine uncertain fields remain partial/manual review.

Combined-row, multi-image, shortened-prompt and extra-grayscale-call experiments
were rejected: they misread names or added work without improving exact-pair
coverage. A high model score is not a calibrated probability of identity accuracy.

## Evidence

- 38 backend unit/control checks pass. Camera utility checks cover geometry,
  capability rejection, timeout, late results, source preservation and size limits.
- The real API suite repeats original documents three times and includes 49
  checks covering rotation, darkness, compression, blur, invalid inputs and health
  responsiveness during concurrent real inference. Review outcomes are reported
  separately from exact fields. Smart CNIC/newer licence retain 8/8 clean fields;
  older licence retains 7/8 with the small authority text requiring review.
- Seven old-card stress cases include independent Urdu names, an unknown name,
  blank name, rotation, darkness and low resolution. Safe outcomes permit a blank
  field with explicit review, never a different populated identity. Only one of
  these seven had both expected names exact in the candidate run. This is not
  seven fully accurate scans and does not establish population-wide accuracy.
- Three simulated sensor-photo captures were encoded by the browser, sent to
  real VPS OCR and populated both visible Urdu fields correctly. Processing took
  6.748, 6.447 and 6.225 seconds; these are not physical-phone camera tests.
- Three OS-camera file-selection flows preserved the original sample and
  populated both fields correctly. Repeated Operator/Admin uploads also verify
  API-to-visible-input equality and RTL direction. No visitor was checked in.
- After cutover, all 13 authentication/application/OCR checks passed at each
  stage: candidate, permanent services and public HTTPS. Public Operator and
  Admin browser forms each passed three real uploads with exact visible Urdu
  names and RTL direction. Operator processing times were 8.860, 7.567 and 7.782
  seconds; Admin times were 7.458, 8.214 and 9.143. This variation is retained in
  the report rather than selecting only the fastest run.

The previous production original-photo HTTP times were 9.20, 9.70 and 9.56 seconds.
After deployment, three isolated original-photo requests took 12.684, 10.134 and
9.663 seconds (median 10.134), with both names exact each time. This does **not**
establish an end-to-end speed improvement for the original upload against the
previous 9.56-second median; the median was approximately 6% slower in this run.
The smaller sensor-crop result above is a different input and must not be used
as a same-image before/after speed comparison.
An isolated vision-thread comparison measured a warm median of 7.61 seconds with
four threads versus 6.07 with six, approximately 20% less name-stage time. Cold
starts, image content, CPU contention, upload and queueing affect elapsed time.
These observations are not a latency SLA or a promise of sub-two-second old-CNIC
scanning. Public release timings and checks are recorded in the private deployment
evidence and final release manifest.

## Deployment and remaining limits

Production uses the existing pinned Qwen3-VL-2B Q4 model, Q8 projector and
llama.cpp runtime. No new cloud OCR dependency or external image upload is added.
Database content/schema and existing backups are preserved. Blue/green deployment
checks real authentication and scans before and after the public proxy switch;
the previous release/configuration is retained for rollback.
All three production services are enabled with zero automatic restarts after
cutover. Temporary candidate services and verification accounts were removed;
database counts returned to four users, one person and one visit.

The clear old-card sample's names are عمار احمد صدیقی and ظفر احمد. Its front
does not contain issue/expiry dates, so those fields stay empty. Identification
marks and difficult Urdu names can still require operator review. Mobile device
capabilities and fresh physical-card capture must be confirmed on the user's
actual phone; synthetic captures and clean uploads cannot establish that result.
Private reports/photos/accounts are excluded from the source archive.
