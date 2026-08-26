import { buildCsv, canConfirmSerial, canCopySerial, chooseCandidates, extractSerials, isValidSerial, normalizeSerial } from './serial.js';
import { snapshotSelectedImages } from './photo-files.js';

export const APP_VERSION = '0.2.0';

const OCR_START_TIMEOUT_MS = 30000;
const FULL_SCAN_WIDTH = 1600;
const HIGH_CONFIDENCE = 90;
const state = { items: [], workerPromise: null, queue: Promise.resolve() };

const dom = {
  photoInput: document.querySelector('#photo-input'),
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

function drawScaled(image) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(1, FULL_SCAN_WIDTH / sourceWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function cloneCanvas(canvas) {
  const clone = document.createElement('canvas');
  clone.width = canvas.width;
  clone.height = canvas.height;
  clone.getContext('2d', { willReadFrequently: true }).drawImage(canvas, 0, 0);
  return clone;
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

  const average = values.reduce((total, value) => total + value, 0) / values.length;
  const thresholded = cloneCanvas(grayscale);
  const thresholdContext = thresholded.getContext('2d', { willReadFrequently: true });
  const thresholdPixels = thresholdContext.getImageData(0, 0, thresholded.width, thresholded.height);
  const threshold = Math.max(120, Math.min(210, Math.round(average * 0.9)));
  for (let index = 0; index < thresholdPixels.data.length; index += 4) {
    const value = thresholdPixels.data[index] > threshold ? 255 : 0;
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
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
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
  const result = await worker.recognize(canvas, {}, { text: true, blocks: true });
  const reads = [];
  for (const line of result.data.lines ?? []) {
    for (const code of extractSerials(line.text)) {
      reads.push({ text: code, confidence: Math.round(line.confidence) });
    }
  }
  return reads;
}

async function processItem(item) {
  item.status = 'processing';
  item.error = '';
  item.codes = [];
  render();
  try {
    const image = await imageFromFile(item.file);
    const variants = buildVariants(drawScaled(image));
    const worker = await getWorker();

    const batchIndex = state.items.indexOf(item) + 1;
    setProgress(`Scanning photo ${batchIndex} of ${state.items.length}`, 0, 'Pass 1');
    const firstPass = await scanPass(worker, variants[0]);
    const needsDeepScan = firstPass.length === 0 || firstPass.some((read) => read.confidence < HIGH_CONFIDENCE);
    const passCount = needsDeepScan ? 3 : 2;

    const passes = [firstPass];
    for (let index = 1; index < passCount; index += 1) {
      setProgress(`Scanning photo ${batchIndex} of ${state.items.length}`, ((index - 1) / (passCount - 1)) * 100, `Pass ${index + 1}/${passCount}`);
      passes.push(await scanPass(worker, variants[index]));
    }

    const candidates = chooseCandidates(passes);
    if (!candidates.length) {
      item.status = 'error';
      item.error = 'No 16-character serial codes were detected in this photo.';
    } else {
      item.status = 'ok';
      item.codes = candidates.map((candidate) => ({
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
  state.items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
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
