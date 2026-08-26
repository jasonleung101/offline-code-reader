import { snapshotSelectedImages } from '../public/photo-files.js';
import { isValidSerial, normalizeSerial } from '../public/serial.js';
import { locatorCrops, shouldScanLocatorCrops } from '../public/recognition.js';
import { buildTrainingSet, isTrainingEntryResolved, normalizeTrainingLabel } from '../public/training-data.js';

const SERIAL_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const state = { photos: [], entries: [], workerPromise: null, queue: Promise.resolve(), scanning: false };
const dom = {
  photoInput: document.querySelector('#training-photo-input'),
  stagingSection: document.querySelector('#staging-section'),
  stagingList: document.querySelector('#staging-list'),
  startScan: document.querySelector('#start-scan-button'),
  progress: document.querySelector('#builder-progress'),
  progressText: document.querySelector('#builder-progress-text'),
  progressCount: document.querySelector('#builder-progress-count'),
  progressBar: document.querySelector('#builder-progress-bar'),
  annotationSection: document.querySelector('#annotation-section'),
  annotationList: document.querySelector('#annotation-list'),
  annotationSummary: document.querySelector('#annotation-summary'),
  download: document.querySelector('#download-dataset-button'),
};

function setProgress(text, percent, count = '') {
  dom.progress.hidden = false;
  dom.progressText.textContent = text;
  dom.progressCount.textContent = count;
  dom.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function clearProgress() {
  dom.progress.hidden = true;
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
  const sideways = rotation === 90 || rotation === 270;
  const canvas = document.createElement('canvas');
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

function cropCanvas(source, crop) {
  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  canvas.getContext('2d', { willReadFrequently: true })
    .drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return canvas;
}

function canvasDataUrl(canvas) {
  return canvas.toDataURL('image/jpeg', 0.95);
}

async function getWorker() {
  if (!state.workerPromise) {
    state.workerPromise = window.Tesseract.createWorker('eng', 1, {
      workerPath: '../public/vendor/tesseract/worker.min.js',
      corePath: '../public/vendor/tesseract-core',
      langPath: '../public/vendor/lang-data',
      cacheMethod: 'none',
      workerBlobURL: false,
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_char_whitelist: SERIAL_WHITELIST,
        preserve_interword_spaces: '0',
        user_defined_dpi: '300',
        tessedit_pageseg_mode: '11',
      });
      return worker;
    });
  }
  return state.workerPromise;
}

async function scanPass(worker, canvas) {
  await worker.setParameters({ tessedit_char_whitelist: SERIAL_WHITELIST, tessedit_pageseg_mode: '11' });
  const result = await worker.recognize(canvas, {}, { text: true, blocks: true });
  return result.data.lines ?? [];
}

function stagedPreviewTransform(rotation) {
  return rotation ? `rotate(${rotation}deg)` : '';
}

function renderStaging() {
  dom.stagingSection.hidden = state.photos.length === 0;
  dom.startScan.disabled = state.scanning || state.photos.length === 0;
  dom.stagingList.replaceChildren(...state.photos.map((photo) => {
    const row = document.createElement('li');
    row.className = 'result-item';
    const image = document.createElement('img');
    image.className = 'thumbnail';
    image.src = photo.previewUrl;
    image.alt = `Staged photo ${photo.file.name}`;
    image.style.transform = stagedPreviewTransform(photo.rotation);
    const main = document.createElement('div');
    main.className = 'result-main';
    const name = document.createElement('p');
    name.className = 'filename';
    name.textContent = photo.file.name;
    const orientation = document.createElement('p');
    orientation.className = 'rotation-label';
    orientation.textContent = photo.rotation ? `${photo.rotation}° selected before scan` : 'Image orientation selected';
    const actions = document.createElement('div');
    actions.className = 'result-actions';
    const rotate = document.createElement('button');
    rotate.type = 'button';
    rotate.className = 'secondary-button';
    rotate.textContent = 'Rotate 90°';
    rotate.disabled = state.scanning;
    rotate.addEventListener('click', () => {
      photo.rotation = (photo.rotation + 90) % 360;
      renderStaging();
    });
    actions.append(rotate);
    main.append(name, orientation, actions);
    row.append(image, main);
    return row;
  }));
}

function annotationStateText(entry) {
  if (entry.skipped) return 'Excluded as not a serial.';
  if (isValidSerial(entry.label)) return 'Ready for private export.';
  return 'Enter all 16 characters or mark this crop not a serial.';
}

function updateAnnotationSummary() {
  const resolved = state.entries.filter(isTrainingEntryResolved).length;
  dom.annotationSummary.textContent = `${resolved} of ${state.entries.length} crops resolved`;
  dom.download.disabled = state.entries.length === 0 || resolved !== state.entries.length;
}

function updateAnnotationEntry(entry, input, skip, detail) {
  entry.label = normalizeTrainingLabel(input.value);
  entry.skipped = false;
  input.value = entry.label;
  input.disabled = false;
  input.setAttribute('aria-invalid', String(entry.label.length > 0 && !isValidSerial(entry.label)));
  skip.textContent = 'Not a serial';
  detail.className = `annotation-state ${isTrainingEntryResolved(entry) ? 'is-resolved' : 'is-unresolved'}`;
  detail.textContent = annotationStateText(entry);
  updateAnnotationSummary();
}

function renderAnnotations() {
  dom.annotationSection.hidden = state.entries.length === 0;
  updateAnnotationSummary();
  dom.annotationList.replaceChildren(...state.entries.map((entry) => {
    const row = document.createElement('li');
    row.className = 'annotation-entry';
    const image = document.createElement('img');
    image.className = 'annotation-image';
    image.src = entry.image;
    image.alt = `Serial crop ${entry.sourceIndex} from ${entry.sourceFile}`;
    const controls = document.createElement('div');
    controls.className = 'annotation-controls';
    const title = document.createElement('p');
    title.className = 'annotation-title';
    title.textContent = `${entry.sourceFile} · crop ${entry.sourceIndex} · ${entry.rotation}°`;
    const label = document.createElement('label');
    label.className = 'annotation-label';
    label.textContent = 'Full 16-character serial';
    const input = document.createElement('input');
    input.className = 'annotation-input';
    input.type = 'text';
    input.maxLength = 16;
    input.autocapitalize = 'characters';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = entry.label;
    input.disabled = entry.skipped;
    input.setAttribute('aria-label', `Full serial for ${entry.sourceFile} crop ${entry.sourceIndex}`);
    input.setAttribute('aria-invalid', String(!entry.skipped && entry.label.length > 0 && !isValidSerial(entry.label)));
    const actions = document.createElement('div');
    actions.className = 'result-actions';
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'secondary-button';
    skip.textContent = entry.skipped ? 'Restore crop' : 'Not a serial';
    skip.addEventListener('click', () => {
      entry.skipped = !entry.skipped;
      renderAnnotations();
    });
    actions.append(skip);
    const detail = document.createElement('p');
    detail.className = `annotation-state ${isTrainingEntryResolved(entry) ? 'is-resolved' : 'is-unresolved'}`;
    detail.textContent = annotationStateText(entry);
    input.addEventListener('input', () => updateAnnotationEntry(entry, input, skip, detail));
    controls.append(title, label, input, actions, detail);
    row.append(image, controls);
    return row;
  }));
}

async function scanStagedPhotos() {
  state.entries = [];
  renderAnnotations();
  const worker = await getWorker();
  for (let photoIndex = 0; photoIndex < state.photos.length; photoIndex += 1) {
    const photo = state.photos[photoIndex];
    setProgress('Locating serial panels locally…', (photoIndex / state.photos.length) * 100, `${photo.file.name} · ${photo.rotation}°`);
    const image = await imageFromFile(photo.file);
    const oriented = drawOriented(image, photo.rotation);
    const crops = locatorCrops(await scanPass(worker, oriented), oriented.width, oriented.height);
    if (shouldScanLocatorCrops(crops)) {
      for (let cropIndex = 0; cropIndex < crops.length; cropIndex += 1) {
        const crop = cropCanvas(oriented, crops[cropIndex]);
        state.entries.push({
          sourceFile: photo.file.name,
          sourceIndex: cropIndex + 1,
          rotation: photo.rotation,
          image: canvasDataUrl(crop),
          label: '',
          skipped: false,
        });
        crop.width = 1;
        crop.height = 1;
      }
    }
    oriented.width = 1;
    oriented.height = 1;
    renderAnnotations();
  }
  setProgress('Private annotation crops are ready.', 100, `${state.entries.length} crops`);
  if (!state.entries.length) {
    dom.annotationSection.hidden = false;
    dom.annotationSummary.textContent = 'No serial-panel crops were detected. Adjust a photo orientation, then start a new scan.';
    dom.download.disabled = true;
  }
}

function addPhotos(fileList) {
  for (const file of snapshotSelectedImages(fileList)) {
    state.photos.push({ file, previewUrl: URL.createObjectURL(file), rotation: 0 });
  }
  renderStaging();
}

function downloadTrainingSet() {
  const dataset = buildTrainingSet(state.entries);
  const blob = new Blob([JSON.stringify(dataset, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'private-serial-training-set.json';
  link.click();
  URL.revokeObjectURL(url);
}

dom.photoInput.addEventListener('change', (event) => {
  addPhotos(event.target.files);
  event.target.value = '';
});
dom.startScan.addEventListener('click', () => {
  state.queue = state.queue.then(async () => {
    state.scanning = true;
    renderStaging();
    try {
      await scanStagedPhotos();
    } catch (error) {
      dom.annotationSummary.textContent = error.message || 'The private scan could not be completed.';
      dom.annotationSection.hidden = false;
    } finally {
      state.scanning = false;
      renderStaging();
      clearProgress();
    }
  });
});
dom.download.addEventListener('click', downloadTrainingSet);
