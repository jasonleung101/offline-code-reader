# High-resolution serial recognition

## Goal

Improve exact serial-code recognition for photographs that contain many small,
rotated serial panels. Recognition remains entirely on device and continues to
accept only an exact 16-character uppercase alphanumeric code.

## Constraints

- Every OCR operation uses the image's original pixel resolution. The pipeline
  must not create a reduced-resolution detection image.
- QR codes are neither decoded nor used to locate or validate serials.
- No serial prefix, suffix, checksum, or other format assumption is made
  beyond the existing 16-character `A-Z0-9` rule.
- A serial candidate must have a `シリアルナンバー` label immediately above it.
- The shipped application remains a static, offline-capable PWA with no new
  remote dependencies.

## Approach

For each photo, the app first processes its original orientation at full
resolution. Only when it finds no exact serial locator read does it try the
90-degree, 270-degree, and finally 180-degree orientations, stopping at the
first orientation with a serial. Each locator scan retains line bounding boxes
whose normalized whitelist text is plausibly a serial (12 to 20 characters).
It releases an unsuccessful orientation before moving to the next one, avoiding
multiple full-size canvases in memory simultaneously.

Each candidate line receives a focused, full-resolution Japanese OCR check in
the strip immediately above it. Only a strip that reads `シリアルナンバー`
admits the candidate. Each admitted line becomes a full-resolution crop with a
small surrounding margin. The app rescans that crop in single-line mode using
an unchanged crop, a grayscale crop, and a locally thresholded crop. The crop
is never resized.
The original locator read is retained as a review-only fallback. The crop
results are normalized and voted per physical crop; only an exact
16-character string that agrees across the crop variants earns `Ready`.

For every `2` or `Z` in an exact locator read, the app separately scans that
original-resolution glyph with a `2Z` allowlist. A glyph must agree across the
same three variants before it can resolve a `2`/`Z` difference; otherwise the
code remains in review with its crop visible.

Candidates that are incomplete, disagree, or have insufficient confidence are
shown as `Needs review`. The UI will display the full-resolution serial crop
alongside its editable value so the reviewer can compare the OCR text to the
printed value without searching the original photo.

## Data flow

1. Decode the original image in the browser.
2. Render the original-resolution canvas and perform the locator pass in
   sparse-text mode; try rotations only when that pass finds no exact serial.
3. Verify the Japanese serial label directly above each plausible locator line.
4. Rescan each label-matched crop in single-line mode with three
   full-resolution variants.
5. Vote the crop results, deduplicate identical accepted serials, and preserve
   uncertain reads for review.
6. Release intermediate canvases and object URLs once each item is cleared.

## Error handling and performance

High-resolution recognition is intentionally slower than the current 1600px
scan. The existing progress UI will identify the orientation and candidate
being processed. Each orientation is processed sequentially and variants are
created only for small candidate crops, which bounds peak canvas memory. If
the browser cannot allocate a full-resolution canvas or OCR fails, the photo
remains in the batch with a retry action and its error message.

## Verification

- Add pure-unit tests for rotation order, locator-line eligibility, and
  crop-vote readiness.
- Retain the generic 16-character validation tests; add cases that prove no
  suffix or QR assumption affects acceptance.
- Add an OCR smoke fixture workflow for the supplied photos and record exact
  serial-code matches before and after the change.
- Run the existing offline, asset-manifest, version, and unit-test checks.

## Non-goals

- QR decoding or QR-based layout detection.
- A custom trained OCR model.
- Auto-correcting ambiguous characters from presumed serial patterns.
