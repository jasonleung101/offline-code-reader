import path from 'node:path';
import process from 'node:process';
import { createWorker } from 'tesseract.js';
import { normalizeSerial } from '../public/serial.js';

const imagePath = process.argv[2];
const psm = process.argv[3] || '11';
const language = process.argv[4] || 'eng';
const langPath = process.argv[5] || path.resolve('node_modules/@tesseract.js-data/eng/4.0.0_best_int');
if (!imagePath) throw new Error('Usage: node scripts/ocr-smoke.mjs <image-path> [psm] [language] [lang-path]');

const worker = await createWorker(language, 1, {
  langPath,
  cacheMethod: 'none',
  gzip: true,
});
await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', user_defined_dpi: '300', tessedit_pageseg_mode: psm });
const { data } = await worker.recognize(imagePath, {}, { text: true });
await worker.terminate();
console.log(JSON.stringify({ rawText: data.text, normalized: normalizeSerial(data.text), confidence: data.confidence }, null, 2));
