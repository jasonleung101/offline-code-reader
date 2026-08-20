// Bump this name whenever any pre-cached application asset changes.
const CACHE_NAME = 'offline-code-reader-v3';
const APP_FILES = [
  './', './index.html', './styles.css', './app.js', './serial.js', './photo-files.js', './manifest.webmanifest', './icon.svg',
  './vendor/tesseract/tesseract.min.js', './vendor/tesseract/worker.min.js', './vendor/lang-data/eng.traineddata.gz',
  './vendor/tesseract-core/tesseract-core.wasm', './vendor/tesseract-core/tesseract-core.wasm.js',
  './vendor/tesseract-core/tesseract-core-simd.wasm', './vendor/tesseract-core/tesseract-core-simd.wasm.js',
  './vendor/tesseract-core/tesseract-core-lstm.wasm', './vendor/tesseract-core/tesseract-core-lstm.wasm.js',
  './vendor/tesseract-core/tesseract-core-simd-lstm.wasm', './vendor/tesseract-core/tesseract-core-simd-lstm.wasm.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
