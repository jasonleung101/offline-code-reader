import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('uses the K2-specific model only for cropped serial recognition', async () => {
  const [app, serviceWorker] = await Promise.all([
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /const LOCATOR_MODEL_LANGUAGE = 'eng';/);
  assert.match(app, /const SERIAL_MODEL_LANGUAGE = 'serial_k2';/);
  assert.match(app, /getLocatorWorker\(\)/);
  assert.match(app, /getSerialWorker\(\)/);
  assert.match(app, /tessedit_pageseg_mode: '13'/);
  assert.match(serviceWorker, /serial_k2\.traineddata\.gz/);
});
