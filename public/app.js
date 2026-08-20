import { buildCsv, chooseCandidate, isValidSerial, normalizeSerial } from './serial.js';

const DEFAULT_CROP = { top: 0.78, height: 0.17, width: 0.74 };
const state = { items: [], workerPromise: null, queue: Promise.resolve(), activeCropId: null };

const dom = {
  photoInput: document.querySelector('#photo-input'),
  status: document.querySelector('#connection-status'),
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
  cropDialog: document.querySelector('#crop-dialog'),
  cropPreview: document.querySelector('#crop-preview'),
  cropTop: document.querySelector('#crop-top'),
  cropHeight: document.querySelector('#crop-height'),
  cropWidth: document.querySelector('#crop-width'),
  cropTopOutput: document.querySelector('#crop-top-output'),
  cropHeightOutput: document.querySelector('#crop-height-output'),
  cropWidthOutput: document.querySelector('#crop-width-output'),
  cropRun: document.querySelector('#crop-run-button'),
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

function readyItems() {
  return state.items.filter((item) => isValidSerial(item.code) && ['ready', 'verified'].includes(item.status));
}

function statusLabel(item) {
  if (item.status === 'ready') return 'Ready';
  if (item.status === 'verified') return 'Verified';
  if (item.status === 'processing') return 'Reading';
  if (item.status === 'error') return 'Could not read';
  return 'Needs review';
}

function itemDetail(item) {
  if (item.status === 'ready') return `Confirmed by all ${item.agreement}/3 OCR passes · average confidence ${item.confidence}%`;
  if (item.status === 'verified') return 'Confirmed by you';
  if (item.status === 'processing') return 'Preparing local OCR…';
  if (item.status === 'error') return item.error || 'Try a clearer photo or adjust the crop.';
  if (item.code) return `One OCR pass suggested this code (${item.confidence}% confidence). Please check it.`;
  return 'No safe 16-character result. Check the photo and enter the printed code.';
}

function render() {
  const hasItems = state.items.length > 0;
  const exportable = readyItems();
  dom.resultsTitle.textContent = hasItems ? `${state.items.length} photo${state.items.length === 1 ? '' : 's'} in this batch` : 'No photos yet';
  dom.emptyState.hidden = hasItems;
  dom.copy.disabled = exportable.length === 0;
  dom.export.disabled = exportable.length === 0;
  dom.clear.disabled = !hasItems;
  dom.list.replaceChildren(...state.items.map(renderItem));
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
  status.className = `status ${item.status === 'verified' ? 'ready' : item.status}`;
  status.textContent = statusLabel(item);
  top.append(name, status);

  const input = document.createElement('input');
  input.className = 'code-input';
  input.type = 'text';
  input.inputMode = 'text';
  input.maxLength = 16;
  input.autocapitalize = 'characters';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.value = item.code;
  input.placeholder = '16-CHARACTER CODE';
  input.setAttribute('aria-label', `Serial code for ${item.file.name}`);
  input.setAttribute('aria-invalid', String(item.code.length > 0 && !isValidSerial(item.code)));
  input.addEventListener('input', () => {
    item.code = normalizeSerial(input.value);
    input.value = item.code;
    item.status = isValidSerial(item.code) ? 'verified' : 'review';
    render();
  });

  const detail = document.createElement('div');
  detail.className = 'result-detail';
  detail.textContent = itemDetail(item);

  const actions = document.createElement('div');
  actions.className = 'result-actions';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'secondary-button';
  retry.textContent = 'Adjust crop & retry';
  retry.addEventListener('click', () => openCropDialog(item));
  actions.append(retry);

  main.append(top, input, detail, actions);
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

function drawCrop(image, crop) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const left = Math.max(0, sourceWidth * 0.02);
  const top = Math.max(0, sourceHeight * crop.top);
  const width = Math.min(sourceWidth - left, sourceWidth * crop.width);
  const height = Math.min(sourceHeight - top, sourceHeight * crop.height);
  const outputWidth = Math.max(600, Math.min(2200, Math.round(width * 2)));
  const outputHeight = Math.max(110, Math.round(outputWidth * (height / width)));
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, left, top, width, height, 0, 0, outputWidth, outputHeight);
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

async function getWorker() {
  if (!state.workerPromise) {
    state.workerPromise = window.Tesseract.createWorker('eng', 1, {
      workerPath: './vendor/tesseract/worker.min.js',
      corePath: './vendor/tesseract-core',
      langPath: './vendor/lang-data',
      cacheMethod: 'none',
      logger: ({ status, progress }) => {
        const percent = Math.round((progress || 0) * 100);
        setProgress(status === 'recognizing text' ? 'Reading serial code locally…' : 'Loading offline OCR…', percent);
      },
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        preserve_interword_spaces: '0',
        user_defined_dpi: '300',
        tessedit_pageseg_mode: '7',
      });
      return worker;
    }).catch((error) => {
      state.workerPromise = null;
      throw new Error(`Offline OCR could not start: ${error.message || error}`);
    });
  }
  return state.workerPromise;
}

async function processItem(item) {
  item.status = 'processing';
  item.error = '';
  render();
  try {
    const image = await imageFromFile(item.file);
    const crop = drawCrop(image, item.crop);
    const variants = buildVariants(crop);
    const worker = await getWorker();
    const reads = [];
    for (let index = 0; index < variants.length; index += 1) {
      setProgress(`Reading image ${state.items.indexOf(item) + 1} of ${state.items.length}`, (index / variants.length) * 100, `Pass ${index + 1}/3`);
      const result = await worker.recognize(variants[index], {}, { text: true });
      reads.push({ text: result.data.text, confidence: result.data.confidence });
    }
    const selected = chooseCandidate(reads);
    item.code = selected.code;
    item.confidence = selected.confidence;
    item.agreement = selected.agreement;
    item.status = selected.trusted ? 'ready' : 'review';
  } catch (error) {
    item.status = 'error';
    item.error = error.message || 'The image could not be processed.';
  }
  render();
}

async function addFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith('image/'));
  if (!files.length) return;
  const newItems = files.map((file) => ({
    id: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file),
    code: '',
    confidence: null,
    agreement: 0,
    status: 'processing',
    crop: { ...DEFAULT_CROP },
  }));
  state.items.push(...newItems);
  render();
  for (const item of newItems) await processItem(item);
  clearProgress();
}

function updateCropControls(item) {
  dom.cropTop.value = Math.round(item.crop.top * 100);
  dom.cropHeight.value = Math.round(item.crop.height * 100);
  dom.cropWidth.value = Math.round(item.crop.width * 100);
  dom.cropTopOutput.value = `${dom.cropTop.value}%`;
  dom.cropHeightOutput.value = `${dom.cropHeight.value}%`;
  dom.cropWidthOutput.value = `${dom.cropWidth.value}%`;
}

async function drawCropPreview() {
  const item = getItem(state.activeCropId);
  if (!item) return;
  const image = await imageFromFile(item.file);
  const canvas = dom.cropPreview;
  const width = 800;
  const height = Math.round(width * ((image.naturalHeight || image.height) / (image.naturalWidth || image.width)));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, width, height);
  const left = width * 0.02;
  const top = height * item.crop.top;
  const cropWidth = width * item.crop.width;
  const cropHeight = height * item.crop.height;
  context.fillStyle = '#0a122a88';
  context.fillRect(0, 0, width, top);
  context.fillRect(0, top, left, cropHeight);
  context.fillRect(left + cropWidth, top, width - left - cropWidth, cropHeight);
  context.fillRect(0, top + cropHeight, width, height - top - cropHeight);
  context.strokeStyle = '#60a5fa';
  context.lineWidth = 5;
  context.strokeRect(left, top, cropWidth, cropHeight);
}

function openCropDialog(item) {
  state.activeCropId = item.id;
  updateCropControls(item);
  dom.cropDialog.showModal();
  drawCropPreview().catch(() => {});
}

function updateActiveCrop() {
  const item = getItem(state.activeCropId);
  if (!item) return;
  item.crop = {
    top: Number(dom.cropTop.value) / 100,
    height: Number(dom.cropHeight.value) / 100,
    width: Number(dom.cropWidth.value) / 100,
  };
  updateCropControls(item);
  drawCropPreview().catch(() => {});
}

function downloadCsv() {
  const csv = buildCsv(readyItems());
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `serial-codes-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function copyCodes() {
  const codes = readyItems().map((item) => item.code).join('\n');
  try {
    await navigator.clipboard.writeText(codes);
    dom.copy.textContent = 'Copied';
    setTimeout(() => { dom.copy.textContent = 'Copy codes'; }, 1800);
  } catch {
    window.prompt('Copy these codes:', codes);
  }
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
  const files = event.target.files;
  state.queue = state.queue.then(() => addFiles(files));
  event.target.value = '';
});
dom.copy.addEventListener('click', copyCodes);
dom.export.addEventListener('click', downloadCsv);
dom.clear.addEventListener('click', clearBatch);
dom.cropRun.addEventListener('click', () => {
  const item = getItem(state.activeCropId);
  if (!item) return;
  dom.cropDialog.close();
  state.queue = state.queue.then(() => processItem(item)).then(clearProgress);
});
[dom.cropTop, dom.cropHeight, dom.cropWidth].forEach((input) => input.addEventListener('input', updateActiveCrop));

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
