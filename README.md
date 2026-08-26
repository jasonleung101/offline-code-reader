# Offline Code Reader

A static, mobile-first PWA that reads 16-character printed serial codes — one or many per photo, anywhere in the frame. It is built for GitHub Pages and processes everything on the device.

## Privacy and offline behavior

- No application API, analytics, telemetry, image upload, or third-party CDN is used.
- OCR JavaScript, WebAssembly, and English data are vendored under `public/vendor/`.
- On the first GitHub Pages visit, the service worker caches the full app. After cache installation it starts and processes photos offline.
- Photos and results remain in memory for the active batch. `Clear batch` releases them; a CSV is only created when the user explicitly exports one.

The app needs access to its own local assets on first use, so it must be loaded from GitHub Pages (or another static web server), not opened as a `file://` HTML file. After that initial cache is complete, turn on airplane mode to use it offline.

## Use

1. Open the hosted page and wait for the status chip to say `offline cache ready`.
2. Optionally install it from the browser's **Add to Home Screen** / **Install app** action.
3. Select or capture photos. Each photo is downscaled and scanned in full; a fast first pass locates codes anywhere in the frame, and extra passes confirm anything uncertain.
4. `Ready` means every executed scan pass agreed at high confidence. `Needs review` means that code will not be trusted or exported until you inspect/edit it into a valid 16-character code.
5. Copy trusted codes or export a CSV (one row per code, with its index within the photo).

The app version is shown in the page footer; `npm run check:version` keeps `package.json`, the web manifest, and the UI constant in sync.

## GitHub Pages publishing

1. Create an empty GitHub repository.
2. Add this project’s `public/` contents to the repository root. Do not add `node_modules/`.
3. In **Settings → Pages**, set the deployment source to **Deploy from a branch** and choose the root of the default branch.
4. Open the resulting HTTPS URL once while online and wait for the cache-ready status.

For a project-site URL such as `https://account.github.io/repository/`, keep all files in the same `public/` directory as supplied; the app intentionally uses relative paths.

## Development checks

```sh
npm test
npm run check:no-network
npm run check:assets
npm run check:version
python3 -m http.server 8080 --directory public
```

Then open `http://localhost:8080`. The service worker works only on `localhost` or HTTPS.

## Accuracy contract

The fixed 16-character format helps substantially, but OCR cannot safely promise that every blurred, skewed, or partially obscured photo is correct. This project avoids silent errors by requiring agreement across repeated full-page scans plus a confidence threshold before it marks a code `Ready` — each code is judged independently, so one weak code never blocks its neighbours. Anything less is deliberately kept in a review state.

A fast sparse-text pass locates codes anywhere in the photo; when that pass already finds every code at high confidence only one confirming pass runs, otherwise two more preprocessing variants (grayscale, thresholded) are scanned and votes are tallied per code.

The supplied sample is correctly isolated to its serial-panel crop; the basic offline Tesseract model flags its ambiguous result for review rather than claiming an incorrect automatic result. A custom character model trained on a representative set of your real photos is the next step if you need reliably hands-free, near-100% recognition.

## Third-party notices

The vendored OCR runtime uses Tesseract.js, Tesseract.js Core, and English data from `@tesseract.js-data/eng`. Licenses are included in `public/vendor/licenses/`.
