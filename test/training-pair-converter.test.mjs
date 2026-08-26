import test from 'node:test';
import assert from 'node:assert/strict';
import { trainingPairEntries } from '../scripts/convert-training-set.mjs';

const image = 'data:image/jpeg;base64,QUJD';

test('turns valid private examples into stable Tesseract pair names', () => {
  assert.deepEqual(trainingPairEntries({
    format: 'offline-code-reader-training-set/v1',
    examples: [
      { label: 'F4MU6RD6P6V7NMK2', image },
      { label: '9QW3E8R7T6Y5U4I1', image },
    ],
  }), [
    { name: 'serial-0001', label: 'F4MU6RD6P6V7NMK2', image },
    { name: 'serial-0002', label: '9QW3E8R7T6Y5U4I1', image },
  ]);
});

test('refuses malformed labels and non-JPEG training crops', () => {
  assert.throws(() => trainingPairEntries({ format: 'offline-code-reader-training-set/v1', examples: [{ label: 'SHORT', image }] }), /16-character/i);
  assert.throws(() => trainingPairEntries({ format: 'offline-code-reader-training-set/v1', examples: [{ label: 'F4MU6RD6P6V7NMK2', image: 'data:image/png;base64,QUJD' }] }), /JPEG/i);
});
