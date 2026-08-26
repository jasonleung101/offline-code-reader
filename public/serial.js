export const SERIAL_PATTERN = /^[A-Z0-9]{16}$/;

export function normalizeSerial(text = '') {
  return String(text)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function normalizeEndingHint(text = '') {
  return normalizeSerial(text).slice(-2);
}

export function isValidSerial(value) {
  return SERIAL_PATTERN.test(value);
}

export function applyEndingHint(code, endingHint = '') {
  const normalizedCode = normalizeSerial(code);
  const normalizedHint = normalizeEndingHint(endingHint);
  if (!normalizedHint || !isValidSerial(normalizedCode)) return normalizedCode;
  return `${normalizedCode.slice(0, -normalizedHint.length)}${normalizedHint}`;
}

export function extractSerials(text = '') {
  return String(text)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => SERIAL_PATTERN.test(token));
}

export function canConfirmSerial(entry) {
  return entry.status === 'review' && isValidSerial(entry.code);
}

export function canCopySerial(entry) {
  return isValidSerial(entry.code) && ['ready', 'verified'].includes(entry.status);
}

export function chooseCandidates(passes) {
  const totals = new Map();
  for (const pass of passes) {
    for (const read of pass) {
      const code = normalizeSerial(read.text ?? read.code);
      if (!isValidSerial(code)) continue;
      const total = totals.get(code) ?? { code, confidenceSum: 0, agreement: 0 };
      total.confidenceSum += Number(read.confidence) || 0;
      total.agreement += 1;
      totals.set(code, total);
    }
  }

  return [...totals.values()].map((total) => {
    const confidence = Math.round(total.confidenceSum / total.agreement);
    return {
      code: total.code,
      confidence,
      agreement: total.agreement,
      passes: passes.length,
      trusted: total.agreement === passes.length && passes.length >= 2 && confidence >= 85,
    };
  });
}

export function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function buildCsv(rows) {
  const header = ['filename', 'code_index', 'serial_code', 'status', 'ocr_confidence'];
  const body = rows.map((row) => [
    row.file.name,
    row.index,
    row.code,
    row.status,
    row.confidence == null ? '' : row.confidence,
  ]);
  return [header, ...body].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
