// Automatic OCR performs exactly one scan in the image decoder's orientation.
// Any rotation is an explicit user action before a separate rescan.
export const ORIENTATIONS = [0];
export const LOCATOR_MIN_LENGTH = 12;
export const LOCATOR_MAX_LENGTH = 20;

function normalizedLocatorText(text = '') {
  return String(text).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function locatorSymbols(line, text) {
  const symbols = (line?.words ?? []).flatMap((word) => word.symbols ?? []);
  const normalized = symbols.map((symbol) => normalizedLocatorText(symbol.text)).join('');
  if (normalized !== text) return [];
  return symbols.map((symbol, index) => ({ index, value: normalizedLocatorText(symbol.text), bbox: symbol.bbox }));
}

export function isPlausibleLocatorLine(line) {
  const text = normalizedLocatorText(line?.text);
  const box = line?.bbox;
  return text.length >= LOCATOR_MIN_LENGTH
    && text.length <= LOCATOR_MAX_LENGTH
    && Number.isFinite(box?.x0)
    && Number.isFinite(box?.y0)
    && Number.isFinite(box?.x1)
    && Number.isFinite(box?.y1)
    && box.x1 > box.x0
    && box.y1 > box.y0;
}

export function locatorCrops(lines, width, height) {
  const minimumLineHeight = Math.max(24, Math.round(height * 0.015));
  return (lines ?? [])
    .filter(isPlausibleLocatorLine)
    .filter(({ bbox }) => bbox.y1 - bbox.y0 >= minimumLineHeight)
    .map((line) => {
      const { bbox, confidence } = line;
      const text = normalizedLocatorText(line.text);
      const lineHeight = bbox.y1 - bbox.y0;
      const horizontalPadding = Math.max(24, Math.round(lineHeight * 0.75));
      const verticalPadding = Math.max(16, Math.round(lineHeight * 0.45));
      const x0 = Math.max(0, Math.floor(bbox.x0 - horizontalPadding));
      const y0 = Math.max(0, Math.floor(bbox.y0 - verticalPadding));
      const x1 = Math.min(width, Math.ceil(bbox.x1 + horizontalPadding));
      const y1 = Math.min(height, Math.ceil(bbox.y1 + verticalPadding));
      return {
        x: x0,
        y: y0,
        width: x1 - x0,
        height: y1 - y0,
        locatorText: text,
        locatorConfidence: Math.round(Number(confidence) || 0),
        ambiguousGlyphs: locatorSymbols(line, text)
          .filter((symbol) => (symbol.value === '2' || symbol.value === 'Z') && symbol.bbox),
      };
    })
    .filter((crop) => crop.width > 0 && crop.height > 0);
}

// The locator is deliberately permissive: crop OCR is the accuracy-critical
// pass, so a missing or mistaken locator character must not prevent a rescan.
export function shouldScanLocatorCrops(crops) {
  return (crops ?? []).length > 0;
}

export function glyphResolutionConflicts(code, resolutions, endingHintLength = 0) {
  const protectedStart = Math.max(0, String(code).length - endingHintLength);
  return (resolutions ?? []).some((resolution) => resolution.value
    && resolution.index < protectedStart
    && String(code)[resolution.index] !== resolution.value);
}

export function glyphResolutionNeedsReview(code, resolutions, endingHintLength = 0) {
  const protectedStart = Math.max(0, String(code).length - endingHintLength);
  return (resolutions ?? []).some((resolution) => resolution.index < protectedStart
    && (!resolution.value || String(code)[resolution.index] !== resolution.value));
}

export function chooseUniqueCandidates(candidates) {
  const byCode = new Map();
  for (const candidate of candidates) {
    const current = byCode.get(candidate.code);
    if (!current
      || Number(candidate.trusted) > Number(current.trusted)
      || candidate.confidence > current.confidence
      || candidate.agreement > current.agreement) {
      byCode.set(candidate.code, candidate);
    }
  }
  return [...byCode.values()].sort((left, right) => Number(right.trusted) - Number(left.trusted) || right.confidence - left.confidence);
}
