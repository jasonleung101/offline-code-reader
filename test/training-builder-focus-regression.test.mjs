import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('keeps the annotation input mounted while its label is typed', async () => {
  const source = await readFile(new URL('../tools/training-set-builder.js', import.meta.url), 'utf8');
  const handler = /input\.addEventListener\('input', \(\) => ([^;]+)\);/.exec(source)?.[1] ?? '';
  assert.match(handler, /updateAnnotationEntry\(entry, input, skip, detail\)/);
  assert.doesNotMatch(handler, /renderAnnotations\(\)/);
});
