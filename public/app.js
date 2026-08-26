import { applyEndingHint, buildCsv, canConfirmSerial, canCopySerial, chooseCandidates, isValidSerial, normalizeEndingHint, normalizeSerial } from './serial.js';
import { snapshotSelectedImages } from './photo-files.js';
import { chooseUniqueCandidates, glyphResolutionConflicts, glyphResolutionNeedsReview, locatorCrops, shouldScanLocatorCrops } from './recognition.js';

export const APP_VERSION = '0.3.3';

const OCR_START_TIMEOUT_MS = 30000;
const SERIAL_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const state = { items: [], workerPromise: null, queue: Promise.resolve(), endingHint: '' };

const dom = {
  photoInput: document.querySelector('#photo-input'),
  endingHint: document.querySelector('#ending-hint'),
  status: document.querySelector('#connection-status'),
  version: document.querySelector('#app-version'),
  progressSection: document.querySelector('#progress-section'),
  progressText: document.querySelector('#progress-text'),
  progressCount: document.querySelector('#progress-count'),
  progressBar: document.querySelector('#progress-bar'),
  progressTrack: document.querySelector('.progress-track'),
  resultsTitle: document.querySelector('#results-title'),
  emptyState: document.querySelector('#empty-state'),
  list: document.querySelector('#results-list'),
  copy: document.querySelector('#copy-button'),
  export: document.querySelector('#export-button'),
  clear: document.querySelector('#clear-button'),
};

function getItem(id) {
  return state.items.find((item) => item.id === id);
}

function setProgress(text, percent = 0, count = '') {
  dom.progressSection.hidden = false;
  dom.progressText.textContent = text;
  dom.progressCount.textContent = count;
  dom.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  dom.progressTrack.setAttribute('aria-valuenow', String(Math.round(percent)));
}

function clearProgress() {
  dom.progressSection.hidden = true;
  dom.progressText.textContent = '';
}

function exportRows() {
  return state.items.flatMap((item) => item.codes.map((entry, index) => ({ file: item.file, index: index + 1, ...entry })))
    .filter((row) => isValidSerial(row.code) && ['ready', 'verified'].includes(row.status));
}

function photoStatusLabel(item) {
  if (item.status === 'processing') return 'Reading';
  if (item.status === 'error') return 'Could not read';
  return `${item.codes.length} code${item.codes.length === 1 ? '' : 's'} found`;
}

function entryLabel(entry) {
  const agreement = entry.agreement === entry.passes ? `all ${entry.passes}` : `${entry.agreement}/${entry.passes}`;
  if (entry.status === 'ready') return `Confirmed by ${agreement} full-scan passes · average confidence ${entry.confidence}%`;
  if (entry.status === 'verified') return 'Confirmed by you';
  if (entry.ambiguityNeedsReview) return 'Could not distinguish a rounded 2 from a sharp Z. Please check the high-resolution crop.';
  if (entry.code) return `Found in ${agreement} pass${entry.passes === 1 ? '' : 'es'} (${entry.confidence}% confidence). Please check it.`;
  return 'Enter the printed code.';
}

function render() {
  const hasItems = state.items.length > 0;
  const rows = exportRows();
  dom.resultsTitle.textContent = hasItems ? `${state.items.length} photo${state.items.length === 1 ? '' : 's'} in this batch` : 'No photos yet';
  dom.emptyState.hidden = hasItems;
  dom.copy.disabled = rows.length === 0;
  dom.export.disabled = rows.length === 0;
  dom.clear.disabled = !hasItems;
  dom.list.replaceChildren(...state.items.map(renderItem));
}

function renderEntry(item, entry) {
  const entryRow = document.createElement('li');
  entryRow.className = 'code-entry';

  const input = document.createElement('input');
  input.className = 'code-input';
  input.type = 'text';
  input.inputMode = 'text';
  input.maxLength = 16;
  input.autocapitalize = 'characters';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.value = entry.code;
  input.placeholder = '16-CHARACTER CODE';
  input.setAttribute('aria-label', `Serial code ${item.codes.indexOf(entry) + 1} for ${item.file.name}`);
  input.setAttribute('aria-invalid', String(entry.code.length > 0 && !isValidSerial(entry.code)));
  input.addEventListener('input', () => {
    entry.code = normalizeSerial(input.value);
    input.value = entry.code;
    entry.status = isValidSerial(entry.code) ? 'verified' : 'review';
    render();
  });

  const preview = entry.cropUrl ? document.createElement('img') : null;
  if (preview) {
    preview.className = 'serial-crop';
    preview.src = entry.cropUrl;
    preview.alt = `High-resolution serial crop for ${item.file.name}`;
  }

  const detail = document.createElement('div');
  detail.className = 'result-detail';
  detail.textContent = entryLabel(entry);

  const actions = document.createElement('div');
  actions.className = 'result-actions';

  if (canConfirmSerial(entry)) {
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'primary-button';
    confirm.textContent = 'Confirm code';
    confirm.addEventListener('click', () => {
      entry.status = 'verified';
      render();
    });
    actions.append(confirm);
  }

  if (canCopySerial(entry)) {
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'secondary-button';
    copy.textContent = 'Copy code';
    copy.addEventListener('click', () => copyText(entry.code, copy, 'Copy code'));
    actions.append(copy);
  }

  if (preview) entryRow.append(preview);
  entryRow.append(input, detail, actions);
  return entryRow;
}

function renderItem(item) {
  const row = document.createElement('li');
  row.className = 'result-item';
  row.dataset.id = item.id;

  const image = document.createElement('img');
  image.className = 'thumbnail';
  image.src = item.previewUrl;
  image.alt = `Photo: ${item.file.name}`;
  row.append(image);

  const main = document.createElement('div');
  main.className = 'result-main';
  const top = document.createElement('div');
  top.className = 'result-topline';
  const name = document.createElement('div');
  name.className = 'filename';
  name.textContent = item.file.name;
  name.title = item.file.name;
  const status = document.createElement('span');
  status.className = `status ${item.status === 'error' ? 'error' : 'ready'}`;
  status.textContent = photoStatusLabel(item);
  top.append(name, status);

  main.append(top);

  if (item.status === 'error') {
    const detail = document.createElement('div');
    detail.className = 'result-detail';
    detail.textContent = item.error || 'Try a clearer photo or rescan.';
    main.append(detail);
  }

  if (item.codes.length > 0) {
    const codeList = document.createElement('ul');
    codeList.className = 'code-list';
    codeList.replaceChildren(...item.codes.map((entry) => renderEntry(item, entry)));
    main.append(codeList);
  }

  const actions = document.createElement('div');
  actions.className = 'result-actions';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'secondary-button';
  retry.textContent = item.status === 'error' && !item.codes.length ? 'Retry scan' : 'Re-scan photo';
  retry.addEventListener('click', () => {
    state.queue = state.queue.then(() => processItem(item)).then(clearProgress);
  });
  actions.append(retry);
  const rotate = document.createElement('button');
  rotate.type = 'button';
  rotate.className = 'secondary-button';
  rotate.textContent = 'Rotate 90° and re-scan';
  rotate.addEventListener('click', () => {
    item.rotation = ((item.rotation || 0) + 90) % 360;
    state.queue = state.queue.then(() => processItem(item)).then(clearProgress);
  });
  actions.append(rotate);
  main.append(actions);

  row.append(main);
  return row;
}

function imageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be opened.')); };
    image.src = url;
  });
}

function drawOriented(image, rotation) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const canvas = document.createElement('canvas');
  const sideways = rotation === 90 || rotation === 270;
  canvas.width = sideways ? sourceHeight : sourceWidth;
  canvas.height = sideways ? sourceWidth : sourceHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (rotation === 90) {
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
  } else if (rotation === 180) {
    context.translate(canvas.width, canvas.height);
    context.rotate(Math.PI);
  } else if (rotation === 270) {
    context.translate(0, canvas.height);
    context.rotate(-Math.PI / 2);
  }
  context.drawImage(image, 0, 0, sourceWidth, sourceHeight);
  return canvas;
}

function cloneCanvas(canvas) {
  const clone = document.createElement('canvas');
  clone.width = canvas.width;
  clone.height = canvas.height;
  clone.getContext('2d', { willReadFrequently: true }).drawImage(canvas, 0, 0);
  return clone;
}

function cropCanvas(source, crop) {
  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  canvas.getContext('2d', { willReadFrequently: true })
    .drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return canvas;
}

function buildVariants(source) {
  const grayscale = cloneCanvas(source);
  const context = grayscale.getContext('2d', { willReadFrequently: true });
  const pixels = context.getImageData(0, 0, grayscale.width, grayscale.height);
  const values = [];
  for (let index = 0; index < pixels.data.length; index += 4) {
    const brightness = Math.round((pixels.data[index] * 0.299) + (pixels.data[index + 1] * 0.587) + (pixels.data[index + 2] * 0.114));
    values.push(brightness);
    pixels.data[index] = brightness;
    pixels.data[index + 1] = brightness;
    pixels.data[index + 2] = brightness;
  }
  context.putImageData(pixels, 0, 0);

  const thresholded = cloneCanvas(grayscale);
  const thresholdContext = thresholded.getContext('2d', { willReadFrequently: true });
  const thresholdPixels = thresholdContext.getImageData(0, 0, thresholded.width, thresholded.height);
  const width = thresholded.width;
  const height = thresholded.height;
  const integral = new Uint32Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= width; x += 1) {
      rowSum += values[((y - 1) * width) + x - 1];
      integral[(y * (width + 1)) + x] = integral[((y - 1) * (width + 1)) + x] + rowSum;
    }
  }
  const radius = Math.max(12, Math.round(Math.min(width, height) / 18));
  for (let index = 0; index < thresholdPixels.data.length; index += 4) {
    const pixelIndex = index / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const x0 = Math.max(0, x - radius);
    const y0 = Math.max(0, y - radius);
    const x1 = Math.min(width - 1, x + radius);
    const y1 = Math.min(height - 1, y + radius);
    const integralWidth = width + 1;
    const total = integral[((y1 + 1) * integralWidth) + x1 + 1]
      - integral[(y0 * integralWidth) + x1 + 1]
      - integral[((y1 + 1) * integralWidth) + x0]
      + integral[(y0 * integralWidth) + x0];
    const average = total / ((x1 - x0 + 1) * (y1 - y0 + 1));
    const value = values[pixelIndex] < average * 0.86 ? 0 : 255;
    thresholdPixels.data[index] = value;
    thresholdPixels.data[index + 1] = value;
    thresholdPixels.data[index + 2] = value;
  }
  thresholdContext.putImageData(thresholdPixels, 0, 0);
  return [source, grayscale, thresholded];
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

async function getWorker() {
  if (!state.workerPromise) {
    const workerStartup = window.Tesseract.createWorker('eng', 1, {
      workerPath: './vendor/tesseract/worker.min.js',
      corePath: './vendor/tesseract-core',
      langPath: './vendor/lang-data',
      cacheMethod: 'none',
      workerBlobURL: false,
      logger: ({ progress }) => {
        const percent = Math.round((progress || 0) * 100);
        setProgress('Reading serial codes locally…', percent);
      },
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_char_whitelist: SERIAL_WHITELIST,
        preserve_interword_spaces: '0',
        user_defined_dpi: '300',
        tessedit_pageseg_mode: '11',
      });
      return worker;
    });
    state.workerPromise = withTimeout(
      workerStartup,
      OCR_START_TIMEOUT_MS,
      `OCR startup timed out after ${Math.round(OCR_START_TIMEOUT_MS / 1000)} seconds. Reload the app and try again.`,
    ).catch((error) => {
      state.workerPromise = null;
      throw new Error(`Offline OCR could not start: ${error.message || error}`);
    });
  }
  return state.workerPromise;
}

async function scanPass(worker, canvas) {
  await worker.setParameters({ tessedit_char_whitelist: SERIAL_WHITELIST, tessedit_pageseg_mode: '11' });
  const result = await worker.recognize(canvas, {}, { text: true, blocks: true });
  return result.data.lines ?? [];
}

async function scanSerialCrop(worker, canvas) {
  await worker.setParameters({ tessedit_char_whitelist: SERIAL_WHITELIST, tessedit_pageseg_mode: '7' });
  const result = await worker.recognize(canvas, {}, { text: true });
  const code = normalizeSerial(result.data.text);
  return isValidSerial(code) ? [{ text: code, confidence: Math.round(result.data.confidence) }] : [];
}

function glyphCrop(source, glyph) {
  const glyphWidth = glyph.bbox.x1 - glyph.bbox.x0;
  const glyphHeight = glyph.bbox.y1 - glyph.bbox.y0;
  const padding = Math.max(16, Math.round(Math.max(glyphWidth, glyphHeight) * 0.8));
  const x = Math.max(0, Math.floor(glyph.bbox.x0 - padding));
  const y = Math.max(0, Math.floor(glyph.bbox.y0 - padding));
  const x1 = Math.min(source.width, Math.ceil(glyph.bbox.x1 + padding));
  const y1 = Math.min(source.height, Math.ceil(glyph.bbox.y1 + padding));
  return { x, y, width: x1 - x, height: y1 - y };
}

async function scan2ZGlyph(worker, canvas) {
  await worker.setParameters({ tessedit_char_whitelist: '2Z', tessedit_pageseg_mode: '10' });
  const result = await worker.recognize(canvas, {}, { text: true });
  const value = normalizeSerial(result.data.text);
  return value === '2' || value === 'Z' ? value : '';
}

async function resolveAmbiguousGlyphs(worker, source, glyphs) {
  const resolutions = [];
  for (const glyph of glyphs) {
    const glyphCanvas = cropCanvas(source, glyphCrop(source, glyph));
    const variants = buildVariants(glyphCanvas);
    const reads = [];
    for (const variant of variants) {
      const value = await scan2ZGlyph(worker, variant);
      if (value) reads.push(value);
    }
    const value = reads.length === variants.length && new Set(reads).size === 1 ? reads[0] : '';
    resolutions.push({ index: glyph.index, value });
    for (const variant of variants) {
      variant.width = 1;
      variant.height = 1;
    }
  }
  return resolutions;
}

function canvasObjectUrl(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ''), 'image/jpeg', 0.92);
  });
}

function revokeCodePreviews(item) {
  for (const entry of item.codes) {
    if (entry.cropUrl) URL.revokeObjectURL(entry.cropUrl);
  }
}

async function processItem(item) {
  item.status = 'processing';
  item.error = '';
  revokeCodePreviews(item);
  item.codes = [];
  render();
  try {
    const image = await imageFromFile(item.file);
    const worker = await getWorker();
    const batchIndex = state.items.indexOf(item) + 1;
    const candidates = [];
    const rotation = item.rotation || 0;
    const endingHint = state.endingHint;
    setProgress(`Locating serial lines in photo ${batchIndex} of ${state.items.length}`, 0, rotation ? `${rotation}° manual orientation` : 'image orientation');
    const oriented = drawOriented(image, rotation);
    const crops = locatorCrops(await scanPass(worker, oriented), oriented.width, oriented.height);
    if (shouldScanLocatorCrops(crops)) {
      for (let cropIndex = 0; cropIndex < crops.length; cropIndex += 1) {
        const definition = crops[cropIndex];
        const glyphResolutions = isValidSerial(definition.locatorText)
          ? await resolveAmbiguousGlyphs(worker, oriented, definition.ambiguousGlyphs)
          : [];
        const crop = cropCanvas(oriented, definition);
        const variants = buildVariants(crop);
        const passes = [];
        for (let variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
          setProgress(`Confirming serial lines in photo ${batchIndex} of ${state.items.length}`, ((cropIndex + (variantIndex / variants.length)) / Math.max(crops.length, 1)) * 100, `${rotation}° · candidate ${cropIndex + 1}/${crops.length}`);
          passes.push(await scanSerialCrop(worker, variants[variantIndex]));
        }
        const hintedPasses = passes.map((pass) => pass.map((read) => ({
          ...read,
          text: applyEndingHint(read.text, endingHint),
        })));
        const cropCandidates = chooseCandidates(hintedPasses).map((candidate) => {
          const ambiguityNeedsReview = glyphResolutionNeedsReview(candidate.code, glyphResolutions, endingHint.length)
            || glyphResolutionConflicts(candidate.code, glyphResolutions, endingHint.length);
          return {
            ...candidate,
            trusted: candidate.trusted && !ambiguityNeedsReview,
            ambiguityNeedsReview,
          };
        });
        const hintedLocatorText = applyEndingHint(definition.locatorText, endingHint);
        if (isValidSerial(hintedLocatorText)) {
          cropCandidates.push({
            code: hintedLocatorText,
            confidence: definition.locatorConfidence,
            agreement: 1,
            passes: variants.length,
            trusted: false,
            ambiguityNeedsReview: glyphResolutionNeedsReview(hintedLocatorText, glyphResolutions, endingHint.length)
              || glyphResolutionConflicts(hintedLocatorText, glyphResolutions, endingHint.length),
          });
        }
        for (const candidate of cropCandidates) {
          const preparedCandidate = {
            ...candidate,
            cropUrl: candidate.trusted ? '' : await canvasObjectUrl(crop),
          };
          candidates.push(preparedCandidate);
        }
        crop.width = 1;
        crop.height = 1;
      }
    }
    oriented.width = 1;
    oriented.height = 1;
    const uniqueCandidates = chooseUniqueCandidates(candidates);
    const selected = new Set(uniqueCandidates);
    for (const candidate of candidates) {
      if (!selected.has(candidate) && candidate.cropUrl) URL.revokeObjectURL(candidate.cropUrl);
    }
    if (!uniqueCandidates.length) {
      item.status = 'error';
      item.error = 'No 16-character serial codes were detected in this photo.';
    } else {
      item.status = 'ok';
      item.codes = uniqueCandidates.map((candidate) => ({
        ...candidate,
        status: candidate.trusted ? 'ready' : 'review',
      }));
    }
  } catch (error) {
    item.status = 'error';
    item.error = error.message || 'The image could not be processed.';
  }
  render();
}

async function addFiles(fileList) {
  const files = snapshotSelectedImages(fileList);
  if (!files.length) return;
  const newItems = files.map((file) => ({
    id: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file),
    codes: [],
    status: 'processing',
    error: '',
    rotation: 0,
  }));
  state.items.push(...newItems);
  render();
  for (const item of newItems) await processItem(item);
  clearProgress();
}

function downloadCsv() {
  const csv = buildCsv(exportRows());
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `serial-codes-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function copyText(text, button, defaultLabel) {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = defaultLabel; }, 1800);
  } catch {
    window.prompt('Copy this code:', text);
  }
}

function copyCodes() {
  return copyText(exportRows().map((row) => row.code).join('\n'), dom.copy, 'Copy codes');
}

function clearBatch() {
  if (!state.items.length || !window.confirm('Clear all photos and results from this active batch?')) return;
  state.items.forEach((item) => {
    URL.revokeObjectURL(item.previewUrl);
    revokeCodePreviews(item);
  });
  state.items = [];
  dom.photoInput.value = '';
  clearProgress();
  render();
}

function updateConnectionStatus() {
  const cached = Boolean(navigator.serviceWorker?.controller);
  dom.status.textContent = cached ? 'On-device · offline cache ready' : 'On-device · initial download needed';
  dom.status.classList.toggle('is-online', !cached && navigator.onLine);
}

dom.photoInput.addEventListener('change', (event) => {
  const files = snapshotSelectedImages(event.target.files);
  state.queue = state.queue.then(() => addFiles(files));
  event.target.value = '';
});
dom.endingHint.addEventListener('input', () => {
  state.endingHint = normalizeEndingHint(dom.endingHint.value);
  dom.endingHint.value = state.endingHint;
});
dom.copy.addEventListener('click', copyCodes);
dom.export.addEventListener('click', downloadCsv);
dom.clear.addEventListener('click', clearBatch);
dom.version.textContent = `v${APP_VERSION}`;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(updateConnectionStatus).catch(() => {
    dom.status.textContent = 'On-device · install cache unavailable';
  });
  navigator.serviceWorker.addEventListener('controllerchange', updateConnectionStatus);
}
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
updateConnectionStatus();
render();
