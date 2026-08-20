# Offline Code Reader — Design

## Goal

Provide a mobile-first, static Progressive Web App that reads batches of photographs containing one 16-character uppercase alphanumeric serial code. The app runs entirely in the browser, keeps images on the device, and can be hosted on GitHub Pages.

## Scope

- Select or capture multiple images on a phone.
- Detect and read the printed serial-number region (not the QR code).
- Validate candidates as exactly 16 characters from `A-Z` and `0-9`.
- Show high-confidence results automatically and require an explicit review for uncertain ones.
- Copy results and export them as CSV.
- Install/cache for offline use after the first GitHub Pages visit.

## Non-goals

- Decoding QR codes.
- Sending images, extracted codes, analytics, or telemetry to a server.
- Claiming OCR can correctly read every unusable, occluded, or blurred image without review.

## Architecture

The repository is a static site with no build server or API. `index.html`, CSS, application JavaScript, the OCR worker/library, and OCR language data are all first-party files. A web-app manifest enables installation and a service worker precaches the complete runtime bundle. No `<script>` or `<link>` may refer to third-party domains.

At runtime, the application keeps source images and derived canvases in browser memory. It does not persist image content or extracted codes unless the user explicitly downloads a CSV. The user can clear the active batch in one action.

## Recognition pipeline

1. Load each image with browser image decoding.
2. Start with the expected lower serial-panel region; provide a manual crop fallback when automatic location is unsuitable.
3. Correct rotation and prepare several canvas variants (grayscale, high-contrast, enlarged, thresholded).
4. Run offline OCR using a single-line mode and the `A-Z0-9` character allowlist.
5. Normalize output, score candidates, and select the agreed candidate.
6. Require the exact 16-character format. Otherwise mark the item **Needs review**, showing the processed crop and editable field.

The application never silently substitutes ambiguous characters. Image results are only labelled **Ready** when they meet the format rule and the multi-pass OCR results agree sufficiently; all other results need human confirmation.

## Mobile UX

The main screen has an explicit privacy/offline status, a large `Add photos` control, batch progress, and a results list. Each row includes a thumbnail, original filename, status, serial value, and an edit/retry control. The touch targets are at least 44px, keyboard focus remains visible, and export is disabled until processing completes. The UI uses bundled/system assets only.

## Error handling

- Explain when browser storage is too small to cache the offline OCR model.
- Keep a failed item in the list with a retry and manual-entry route.
- Do not discard completed batch results when a later photo fails.
- Surface OCR initialization and service-worker caching progress clearly.

## Verification

- Unit-test validation and candidate scoring, including ambiguous inputs and non-16-character output.
- Run the app against supplied sample images and confirm results are correctly classified.
- Test without a network connection after the initial cache is complete.
- Verify there are no remote URL dependencies in the shipped source.

## Publishing

Push the static project to a GitHub repository and configure GitHub Pages to deploy its root (or `/docs`). The first online visit installs/caches the assets; later visits use the cached bundle and perform no app-initiated network requests.
