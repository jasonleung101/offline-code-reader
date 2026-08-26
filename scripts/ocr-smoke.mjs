import path from 'node:path';
import process from 'node:process';
import { createWorker } from 'tesseract.js';
import { normalizeSerial } from '../public/serial.js';

const imagePath = process.argv[2];
const psm = process.argv[3] || '11';
if (!imagePath) throw new Error('Usage: node scripts/ocr-smoke.mjs <image-path> [psm]');

const worker = await createWorker('eng', 1, {
  langPath: path.resolve('node_modules/@tesseract.js-data/eng/4.0.0_best_int'),
  cacheMethod: 'none',
  gzip: true,
});
await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', user_defined_dpi: '300', tessedit_pageseg_mode: psm });
const { data } = await worker.recognize(imagePath, {}, { text: true });
await worker.terminate();
console.log(JSON.stringify({ rawText: data.text, normalized: normalizeSerial(data.text), confidence: data.confidence }, null, 2));
