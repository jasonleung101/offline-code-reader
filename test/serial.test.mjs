import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEndingHint, buildCsv, canConfirmSerial, canCopySerial, chooseCandidates, extractSerials, isValidSerial, normalizeEndingHint, normalizeSerial } from '../public/serial.js';

test('normalizes OCR whitespace and punctuation without altering valid characters', () => {
  assert.equal(normalizeSerial(' F4MU6R\nD6P6V7NMK2 '), 'F4MU6RD6P6V7NMK2');
  assert.equal(isValidSerial('F4MU6RD6P6V7NMK2'), true);
  assert.equal(isValidSerial('F4MU6RD6P6V7NMK'), false);
});

test('uses an optional one or two character ending hint without changing the preceding serial', () => {
  assert.equal(normalizeEndingHint(' k2 '), 'K2');
  assert.equal(normalizeEndingHint('a-k2'), 'K2');
  assert.equal(applyEndingHint('F4MU6RD6P6V7NMKZ', '2'), 'F4MU6RD6P6V7NMK2');
  assert.equal(applyEndingHint('F4MU6RD6P6V7NMZZ', 'K2'), 'F4MU6RD6P6V7NMK2');
  assert.equal(applyEndingHint('F4MU6RD6P6V7NMK2', ''), 'F4MU6RD6P6V7NMK2');
  assert.equal(applyEndingHint('TOO-SHORT', 'K2'), 'TOOSHORT');
});

test('extracts every exact 16-character token from arbitrary page text', () => {
  const reads = extractSerials('SN: F4MU6RD6P6V7NMK2\nBatch 9QW3E8R7T6Y5U4I1\nF4MU6RD6P6V7NMK\nLOREM IPSUM DOLOR SIT AM');
  assert.deepEqual(reads, ['F4MU6RD6P6V7NMK2', '9QW3E8R7T6Y5U4I1']);
});

test('trusts a code only when every executed pass agrees at high confidence', () => {
  const twoUnanimous = chooseCandidates([
    [{ text: 'F4MU6RD6P6V7NMK2', confidence: 91 }],
    [{ text: 'F4MU6RD6P6V7NMK2', confidence: 93 }],
  ]);
  assert.equal(twoUnanimous.length, 1);
  assert.equal(twoUnanimous[0].trusted, true);
  assert.equal(twoUnanimous[0].confidence, 92);
  assert.equal(twoUnanimous[0].agreement, 2);
  assert.equal(twoUnanimous[0].passes, 2);
});

test('never trusts partial agreement, low confidence, or a single pass', () => {
  assert.equal(chooseCandidates([
    [{ text: 'F4MU6RD6P6V7NMK2', confidence: 98 }],
    [{ text: 'F4MU6RD6P6V7NMKZ', confidence: 98 }],
    [{ text: 'F4MU6RD6P6V7NMK2', confidence: 98 }],
  ])[0].trusted, false);
  assert.equal(chooseCandidates([
    [{ text: 'F4MU6RD6P6V7NMK2', confidence: 60 }],
    [{ text: 'F4MU6RD6P6V7NMK2', confidence: 60 }],
    [{ text: 'F4MU6RD6P6V7NMK2', confidence: 60 }],
  ])[0].trusted, false);
  assert.equal(chooseCandidates([
    [{ text: 'F4MU6RD6P6V7NMK2', confidence: 99 }],
  ])[0].trusted, false);
});

test('votes each detected code independently within the same passes', () => {
  const candidates = chooseCandidates([
    [{ text: 'F4MU6RD6P6V7NMK2', confidence: 95 }, { text: '9QW3E8R7T6Y5U4I1', confidence: 40 }],
    [{ text: 'F4MU6RD6P6V7NMK2', confidence: 97 }, { text: '9QW3E8R7T6Y5U4I1', confidence: 44 }],
  ]);
  assert.deepEqual(candidates.map((candidate) => [candidate.code, candidate.trusted]), [
    ['F4MU6RD6P6V7NMK2', true],
    ['9QW3E8R7T6Y5U4I1', false],
  ]);
});

test('exports one quoted CSV row per code with its photo index', () => {
  const csv = buildCsv([
    { file: { name: 'photo, one.jpg' }, index: 1, code: 'F4MU6RD6P6V7NMK2', status: 'ready', confidence: 89 },
    { file: { name: 'photo, one.jpg' }, index: 2, code: '9QW3E8R7T6Y5U4I1', status: 'verified', confidence: '' },
  ]);
  assert.equal(csv, '"filename","code_index","serial_code","status","ocr_confidence"\r\n"photo, one.jpg","1","F4MU6RD6P6V7NMK2","ready","89"\r\n"photo, one.jpg","2","9QW3E8R7T6Y5U4I1","verified",""');
});

test('allows an explicit review only for a valid code that still needs review', () => {
  assert.equal(canConfirmSerial({ code: 'F4MU6RD6P6V7NMK2', status: 'review' }), true);
  assert.equal(canConfirmSerial({ code: 'F4MU6RD6P6V7NMK', status: 'review' }), false);
  assert.equal(canConfirmSerial({ code: 'F4MU6RD6P6V7NMK2', status: 'ready' }), false);
});

test('allows per-item copying only for ready or verified serials', () => {
  assert.equal(canCopySerial({ code: 'F4MU6RD6P6V7NMK2', status: 'ready' }), true);
  assert.equal(canCopySerial({ code: 'F4MU6RD6P6V7NMK2', status: 'verified' }), true);
  assert.equal(canCopySerial({ code: 'F4MU6RD6P6V7NMK2', status: 'review' }), false);
  assert.equal(canCopySerial({ code: 'F4MU6RD6P6V7NMK', status: 'verified' }), false);
});
