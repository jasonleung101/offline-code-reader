import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('snapshots the selected FileList before clearing the file input', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /const files = \[\.\.\.event\.target\.files\];/);
});
