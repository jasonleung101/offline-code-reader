import { isValidSerial, normalizeSerial } from './serial.js';

export function normalizeTrainingLabel(value = '') {
  return normalizeSerial(value);
}

export function isTrainingEntryResolved(entry) {
  return Boolean(entry?.skipped) || isValidSerial(normalizeTrainingLabel(entry?.label));
}

export function buildTrainingSet(entries = []) {
  if (!(entries ?? []).every(isTrainingEntryResolved)) {
    throw new Error('Unresolved serial crops must be labeled or marked not a serial before export.');
  }
  return {
    format: 'offline-code-reader-training-set/v1',
    examples: entries
      .filter((entry) => !entry.skipped)
      .map((entry) => ({
        sourceFile: String(entry.sourceFile),
        sourceIndex: Number(entry.sourceIndex),
        rotation: Number(entry.rotation) || 0,
        label: normalizeTrainingLabel(entry.label),
        image: String(entry.image),
      })),
  };
}
