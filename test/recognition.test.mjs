import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCATOR_MAX_LENGTH, LOCATOR_MIN_LENGTH, ORIENTATIONS, applyGlyphResolutions, chooseUniqueCandidates, hasExactLocatorSerial, isPlausibleLocatorLine, locatorCrops } from '../public/recognition.js';

const serialLine = {
  text: 'F4MU6RD6P6V7NMK2',
  bbox: { x0: 100, y0: 200, x1: 500, y1: 250 },
};

test('checks the original orientation before rotation fallbacks', () => {
  assert.deepEqual(ORIENTATIONS, [0, 90, 270, 180]);
});

test('keeps plausible serial lines without presuming a suffix or QR payload', () => {
  assert.equal(isPlausibleLocatorLine(serialLine), true);
  assert.equal(isPlausibleLocatorLine({ ...serialLine, text: 'ABCDEFGHIJKLMNQ9' }), true);
  assert.equal(isPlausibleLocatorLine({ ...serialLine, text: 'A'.repeat(LOCATOR_MIN_LENGTH - 1) }), false);
  assert.equal(isPlausibleLocatorLine({ ...serialLine, text: 'A'.repeat(LOCATOR_MAX_LENGTH + 1) }), false);
});

test('adds padding to a locator crop but keeps it inside the source image', () => {
  assert.deepEqual(locatorCrops([serialLine], 600, 500), [{ x: 62, y: 177, width: 476, height: 96, locatorText: 'F4MU6RD6P6V7NMK2', locatorConfidence: 0, ambiguousGlyphs: [] }]);
  assert.deepEqual(locatorCrops([{ ...serialLine, bbox: { x0: 2, y0: 2, x1: 30, y1: 26 } }], 100, 100), [{ x: 0, y: 0, width: 54, height: 42, locatorText: 'F4MU6RD6P6V7NMK2', locatorConfidence: 0, ambiguousGlyphs: [] }]);
  assert.deepEqual(locatorCrops([{ ...serialLine, bbox: { x0: 2, y0: 2, x1: 30, y1: 12 } }], 100, 100), []);
});

test('stops rotation fallbacks when the original orientation already has a serial', () => {
  assert.equal(hasExactLocatorSerial([{ locatorText: 'F4MU6RD6P6V7NMK2' }]), true);
  assert.equal(hasExactLocatorSerial([{ locatorText: 'F4MU6RD6P6V7NMK' }]), false);
});

test('retains exact 2 and Z glyph bounds for a focused recheck', () => {
  const text = 'F4MU6RD6P6V7NMKZ';
  const line = {
    ...serialLine,
    text,
    words: [{
      symbols: [...text].map((value, index) => ({
        text: value,
        bbox: { x0: index * 10, y0: 10, x1: (index * 10) + 8, y1: 30 },
      })),
    }],
  };
  assert.deepEqual(locatorCrops([line], 600, 500)[0].ambiguousGlyphs, [
    { index: 15, value: 'Z', bbox: { x0: 150, y0: 10, x1: 158, y1: 30 } },
  ]);
});

test('only changes 2 and Z when a character-level check resolves them', () => {
  assert.equal(applyGlyphResolutions('F4MU6RD6P6V7NMKZ', [{ index: 15, value: '2' }]), 'F4MU6RD6P6V7NMK2');
  assert.equal(applyGlyphResolutions('F4MU6RD6P6V7NMK2', [{ index: 15, value: 'Z' }]), 'F4MU6RD6P6V7NMKZ');
  assert.equal(applyGlyphResolutions('F4MU6RD6P6V7NMK2', [{ index: 4, value: 'Z' }]), 'F4MU6RD6P6V7NMK2');
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
