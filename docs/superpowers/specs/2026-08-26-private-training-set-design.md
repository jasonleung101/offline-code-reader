# Private serial training set and pre-scan orientation

## Goal

Let a person choose the correct orientation before OCR starts and privately
label every detected serial crop from a set of photos. The result is a single
self-contained dataset file suitable for later model evaluation or training.

## Constraints

- OCR automatically scans exactly one orientation per photo.
- Rotation is selected by the person before the scan; OCR never probes
  multiple rotations.
- All source photos, OCR, labels, crop generation, and export remain in the
  browser. No uploads, analytics, remote model, repository writes, or network
  requests are introduced.
- A label is an exact 16-character uppercase alphanumeric serial, with an
  explicit `Not a serial` option for false-positive crops.
- The export includes only serial-panel crops, not the full source photos.

## User flow

1. Select one or more photos. They enter a staging list rather than beginning
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
- `app.js` owns staged-photo state, the selected rotation, one-pass OCR,
  annotation state, and object URL lifecycle.
- The existing normal scan result flow remains available; annotation state is
  explicitly entered only from the private training workflow.

## Error handling

- An empty scan reports that no serial-panel crops were detected and provides
  an explicit retry after the user adjusts rotation.
- Invalid labels remain visibly invalid and block the export.
- A generated data URL that cannot be created leaves the affected crop
  unresolved and reports the failure without exporting partial data.
- Clearing a batch revokes all preview and crop object URLs.

## Verification

- Unit-test one automatic orientation and user-selected manual rotation.
- Unit-test serial-label validation, explicit false-positive resolution, and
  self-contained JSON export without full-photo payloads.
- Retain current OCR candidate, ambiguity, offline, asset, and version tests.
- Manually verify the pre-scan controls and annotation form at phone width.

## Non-goals

- Training a custom model in the browser.
- Uploading or automatically sharing a dataset.
- Inferring labels from suffix patterns.
- Automatically rotating photos based on OCR results.
