import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('permits local WebAssembly and avoids a blob OCR worker', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.match(app, /workerBlobURL: false/);
  assert.match(app, /OCR startup timed out after/);
});

test('stages photos for a user-selected orientation before OCR starts', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="start-scan-button"/);
  assert.match(app, /status: 'staged'/);
  assert.match(app, /rotate\.textContent = 'Rotate 90°'/);
  assert.match(app, /dom\.startScan\.addEventListener\('click'/);
});
