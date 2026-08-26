# Offline Code Reader

A static, mobile-first PWA that reads 16-character printed serial codes — one or many per photo, anywhere in the frame. It is built for GitHub Pages and processes everything on the device.

## Privacy and offline behavior

- No application API, analytics, telemetry, image upload, or third-party CDN is used.
- OCR JavaScript, WebAssembly, English locator data, and the bundled K2-specific serial model are vendored under `public/vendor/`.
- On the first GitHub Pages visit, the service worker caches the full app. After cache installation it starts and processes photos offline.
- Photos and results remain in memory for the active batch. `Clear batch` releases them; a CSV is only created when the user explicitly exports one.

The app needs access to its own local assets on first use, so it must be loaded from GitHub Pages (or another static web server), not opened as a `file://` HTML file. After that initial cache is complete, turn on airplane mode to use it offline.

## Use

1. Open the hosted page and wait for the status chip to say `offline cache ready`.
2. Optionally install it from the browser's **Add to Home Screen** / **Install app** action.
3. Optionally enter one or two known final characters (for example `2` or `K2`) before selecting photos. Photos first enter a staging list: rotate a visibly sideways photo there, then choose **Start scan**. Each scan uses only that one selected orientation at the original resolution. Serial-line crops receive extra confirmation passes.
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

A full-resolution sparse-text pass locates plausible serial lines anywhere in the photo, even when that first read is incomplete. Each automatic scan uses only the decoded image orientation; a person can explicitly rotate a sideways photo and start a separate rescan. The app rescans each candidate crop at its original resolution and in full-resolution grayscale before accepting a complete code. An optional, user-provided one- or two-character ending hint replaces only those known final characters; all preceding characters must still agree across OCR passes. It also independently rechecks `2` and `Z` glyphs outside that supplied ending; any disagreement leaves the result in review instead of silently changing it.

The app locates candidate serial lines with the stock English OCR model, then reads each serial crop with the bundled K2-specific model. It was fine-tuned only with the owner's private K2-ending serial labels, so it should be used for that K2-ending format rather than as a general serial model.

## Owner-only training data

The public site does not collect or export training data. To create your own private set from local photos, run a local static server from the repository root and open [tools/training-set-builder.html](tools/training-set-builder.html). Rotate photos before its single OCR pass, type each complete 16-character serial, then download the self-contained JSON. It contains serial-panel crops and labels only. Train your model separately; once you provide the trained data file, it can be bundled into the public scanner for every visitor without accepting any visitor data.

Convert that JSON into Tesseract-compatible PNG and transcription pairs locally:

```sh
node scripts/convert-training-set.mjs private-serial-training-set.json training-ground-truth
```

This creates `serial-0001.png` beside `serial-0001.gt.txt` for each labeled crop. Both the downloaded dataset and generated directory are ignored by Git.

## Third-party notices

The vendored OCR runtime uses Tesseract.js, Tesseract.js Core, and English data from `@tesseract.js-data/eng`. Licenses are included in `public/vendor/licenses/`.
