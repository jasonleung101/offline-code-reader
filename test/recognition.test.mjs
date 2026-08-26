import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCATOR_MAX_LENGTH, LOCATOR_MIN_LENGTH, ORIENTATIONS, chooseUniqueCandidates, isPlausibleLocatorLine, locatorCrops } from '../public/recognition.js';

const serialLine = {
  text: 'F4MU6RD6P6V7NMK2',
  bbox: { x0: 100, y0: 200, x1: 500, y1: 250 },
};

test('checks every right-angle orientation at original resolution', () => {
  assert.deepEqual(ORIENTATIONS, [0, 90, 180, 270]);
});

test('keeps plausible serial lines without presuming a suffix or QR payload', () => {
  assert.equal(isPlausibleLocatorLine(serialLine), true);
  assert.equal(isPlausibleLocatorLine({ ...serialLine, text: 'ABCDEFGHIJKLMNQ9' }), true);
  assert.equal(isPlausibleLocatorLine({ ...serialLine, text: 'A'.repeat(LOCATOR_MIN_LENGTH - 1) }), false);
  assert.equal(isPlausibleLocatorLine({ ...serialLine, text: 'A'.repeat(LOCATOR_MAX_LENGTH + 1) }), false);
});

test('adds padding to a locator crop but keeps it inside the source image', () => {
  assert.deepEqual(locatorCrops([serialLine], 600, 500), [{ x: 62, y: 177, width: 476, height: 96, locatorText: 'F4MU6RD6P6V7NMK2', locatorConfidence: 0 }]);
  assert.deepEqual(locatorCrops([{ ...serialLine, bbox: { x0: 2, y0: 2, x1: 30, y1: 26 } }], 100, 100), [{ x: 0, y: 0, width: 54, height: 42, locatorText: 'F4MU6RD6P6V7NMK2', locatorConfidence: 0 }]);
  assert.deepEqual(locatorCrops([{ ...serialLine, bbox: { x0: 2, y0: 2, x1: 30, y1: 12 } }], 100, 100), []);
});

test('deduplicates the same serial while retaining the safest reading', () => {
  const candidates = chooseUniqueCandidates([
    { code: 'F4MU6RD6P6V7NMK2', trusted: false, confidence: 99, agreement: 2 },
    { code: 'F4MU6RD6P6V7NMK2', trusted: true, confidence: 90, agreement: 3 },
    { code: '9QW3E8R7T6Y5U4I1', trusted: false, confidence: 91, agreement: 1 },
  ]);
  assert.deepEqual(candidates, [
    { code: 'F4MU6RD6P6V7NMK2', trusted: true, confidence: 90, agreement: 3 },
    { code: '9QW3E8R7T6Y5U4I1', trusted: false, confidence: 91, agreement: 1 },
  ]);
});
