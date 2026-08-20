export const SERIAL_PATTERN = /^[A-Z0-9]{16}$/;

export function normalizeSerial(text = '') {
  return String(text)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function isValidSerial(value) {
  return SERIAL_PATTERN.test(value);
}

export function canConfirmSerial(item) {
  return item.status === 'review' && isValidSerial(item.code);
}

export function chooseCandidate(reads) {
  const validReads = reads
    .map((read) => ({ ...read, code: normalizeSerial(read.text) }))
    .filter((read) => isValidSerial(read.code));

  if (!validReads.length) {
    return { code: '', confidence: 0, agreement: 0, trusted: false, reads: validReads };
  }

  const groups = new Map();
  for (const read of validReads) {
    const group = groups.get(read.code) ?? { code: read.code, confidence: 0, count: 0 };
    group.count += 1;
    group.confidence += Number(read.confidence) || 0;
    groups.set(read.code, group);
  }

  const best = [...groups.values()].sort((left, right) => (
    right.count - left.count || right.confidence - left.confidence
  ))[0];
  const confidence = Math.round(best.confidence / best.count);

  return {
    code: best.code,
    confidence,
    agreement: best.count,
    trusted: best.count === 3 && confidence >= 85,
    reads: validReads,
  };
}

export function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function buildCsv(items) {
  const header = ['filename', 'serial_code', 'status', 'ocr_confidence'];
  const rows = items.map((item) => [
    item.file.name,
    item.code,
    item.status,
    item.confidence == null ? '' : item.confidence,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
