import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildTrainingSet, isTrainingEntryResolved, normalizeTrainingLabel } from '../public/training-data.js';

const baseEntry = {
  sourceFile: 'IMG_5132.jpg',
  sourceIndex: 1,
  rotation: 90,
  image: 'data:image/jpeg;base64,QUJD',
  label: '',
  skipped: false,
};

test('normalizes complete training labels and rejects incomplete labels', () => {
  assert.equal(normalizeTrainingLabel(' f4mu6rd6p6v7nmk2 '), 'F4MU6RD6P6V7NMK2');
  assert.equal(normalizeTrainingLabel('F4MU6RD6P6V7NMK'), 'F4MU6RD6P6V7NMK');
  assert.equal(isTrainingEntryResolved({ ...baseEntry, label: 'F4MU6RD6P6V7NMK2' }), true);
  assert.equal(isTrainingEntryResolved({ ...baseEntry, label: 'F4MU6RD6P6V7NMK' }), false);
  assert.equal(isTrainingEntryResolved({ ...baseEntry, skipped: true }), true);
});

test('builds a self-contained dataset from labels while omitting skipped crops', () => {
  const dataset = buildTrainingSet([
    { ...baseEntry, label: 'F4MU6RD6P6V7NMK2' },
    { ...baseEntry, sourceIndex: 2, skipped: true },
  ]);
  assert.deepEqual(dataset, {
    format: 'offline-code-reader-training-set/v1',
    examples: [{
      sourceFile: 'IMG_5132.jpg',
      sourceIndex: 1,
      rotation: 90,
      label: 'F4MU6RD6P6V7NMK2',
      image: 'data:image/jpeg;base64,QUJD',
    }],
  });
  assert.equal(JSON.stringify(dataset).includes('fullPhoto'), false);
});

test('refuses an incomplete private dataset export', () => {
  assert.throws(() => buildTrainingSet([baseEntry]), /unresolved/i);
});

test('keeps owner annotation controls out of the published Pages artifact', async () => {
  const [workflow, publicPage, builder] = await Promise.all([
    readFile(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8'),
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../tools/training-set-builder.html', import.meta.url), 'utf8'),
  ]);
  assert.match(workflow, /path: \.\/public/);
  assert.doesNotMatch(publicPage, /Download training set/);
  assert.match(builder, /Download training set/);
});
