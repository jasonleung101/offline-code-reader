import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCsv, chooseCandidate, isValidSerial, normalizeSerial } from '../public/serial.js';

test('normalizes OCR whitespace and punctuation without altering valid characters', () => {
  assert.equal(normalizeSerial(' F4MU6R\nD6P6V7NMK2 '), 'F4MU6RD6P6V7NMK2');
  assert.equal(isValidSerial('F4MU6RD6P6V7NMK2'), true);
  assert.equal(isValidSerial('F4MU6RD6P6V7NMK'), false);
});

test('trusts an exact candidate only when all OCR passes agree at high confidence', () => {
  const result = chooseCandidate([
    { text: 'F4MU6RD6P6V7NMK2', confidence: 91 },
    { text: 'F4MU6RD6P6V7NMK2', confidence: 87 },
    { text: 'F4MU6RD6P6V7NMK2', confidence: 92 },
  ]);
  assert.deepEqual(result, {
    code: 'F4MU6RD6P6V7NMK2',
    confidence: 90,
    agreement: 3,
    trusted: true,
    reads: [
      { text: 'F4MU6RD6P6V7NMK2', confidence: 91, code: 'F4MU6RD6P6V7NMK2' },
      { text: 'F4MU6RD6P6V7NMK2', confidence: 87, code: 'F4MU6RD6P6V7NMK2' },
      { text: 'F4MU6RD6P6V7NMK2', confidence: 92, code: 'F4MU6RD6P6V7NMK2' },
    ],
  });
});

test('never trusts partial agreement or an invalid result', () => {
  assert.equal(chooseCandidate([
    { text: 'F4MU6RD6P6V7NMK2', confidence: 98 },
    { text: 'F4MU6RD6P6V7NMK2', confidence: 98 },
    { text: 'F4MU6RD6P6V7NMKZ', confidence: 98 },
  ]).trusted, false);
  assert.deepEqual(chooseCandidate([{ text: 'not a serial', confidence: 98 }]).code, '');
});

test('exports a safe, quoted CSV', () => {
  assert.equal(buildCsv([{ file: { name: 'photo, one.jpg' }, code: 'F4MU6RD6P6V7NMK2', status: 'ready', confidence: 89 }]), '"filename","serial_code","status","ocr_confidence"\r\n"photo, one.jpg","F4MU6RD6P6V7NMK2","ready","89"');
});
