# Private serial training set and pre-scan orientation

## Goal

Let the owner choose the correct orientation before OCR starts and privately
label every detected serial crop from a set of photos. The result is a single
self-contained dataset file for the owner to train a model outside this app.
The public website uses only the owner's subsequently supplied trained model.

## Constraints

- OCR automatically scans exactly one orientation per photo.
- Rotation is selected by the person before the scan; OCR never probes
  multiple rotations.
- All source photos, OCR, labels, crop generation, and export remain in the
  browser. No uploads, analytics, remote model, repository writes, or network
  requests are introduced.
- No visitor can add examples to, export, modify, or otherwise influence the
  owner's training set or deployed model.
- A label is an exact 16-character uppercase alphanumeric serial, with an
  explicit `Not a serial` option for false-positive crops.
- The export includes only serial-panel crops, not the full source photos.

## User flow

1. In the owner's local training-set builder, select one or more photos. They
   enter a staging list rather than beginning
   OCR immediately.
2. Rotate a photo by 90 degrees as needed. The selected angle is visible on
   its preview. This is a pre-scan operation, not an OCR fallback.
3. Choose **Start scan**. Each staged photo is scanned once, at its chosen
   angle, and yields plausible serial-panel crops.
4. In annotation mode, each crop presents an editable full-code field and a
   **Not a serial** action. The field must contain exactly 16 uppercase
   alphanumeric characters to resolve that crop.
5. When every crop is resolved, choose **Download training set**. No export is
   possible while a crop is unresolved.

## Dataset format

The download is JSON with a versioned envelope and an `examples` array. Each
example contains:

- `sourceFile`: original filename, for local provenance only;
- `sourceIndex`: one-based order within its selected photo;
- `rotation`: chosen 0/90/180/270 degree angle;
- `label`: the verified 16-character serial;
- `image`: a JPEG data URL containing the full-resolution panel crop.

False-positive crops are not included. The JSON is self-contained: retaining
the original photos is not required to use the training examples later.

## Components and boundaries

- `photo-files.js` continues to own safe file snapshots.
- A new pure training-data module owns label normalization, resolution checks,
  and JSON dataset construction. It does not read browser state or canvases.
- A private local training-set builder owns staged-photo state, the selected
  rotation, one-pass OCR, annotation state, and object URL lifecycle. It is
  not included in the production `public/` site.
- `app.js` remains the public scanner. It never exposes training-set creation
  or export controls.
- After the owner trains a model externally, they provide the model file for
  bundling under `public/vendor/lang-data/`. The production scanner uses that
  one bundled model for every visitor; its version is included in the app and
  service-worker cache release.

## Error handling

- An empty scan reports that no serial-panel crops were detected and provides
  an explicit retry after the user adjusts rotation.
- Invalid labels remain visibly invalid and block the export.
- A generated data URL that cannot be created leaves the affected crop
  unresolved and reports the failure without exporting partial data.
- Clearing a batch revokes all preview and crop object URLs.

## Verification

- Unit-test one automatic orientation and owner-selected manual rotation.
- Unit-test serial-label validation, explicit false-positive resolution, and
  self-contained JSON export without full-photo payloads.
- Retain current OCR candidate, ambiguity, offline, asset, and version tests.
- Verify the production UI contains no training-data controls.
- Manually verify the private local builder at phone width.

## Non-goals

- Training a custom model in the browser or accepting a visitor-supplied model.
- Uploading, automatically sharing, or collecting a visitor dataset.
- Inferring labels from suffix patterns.
- Automatically rotating photos based on OCR results.
