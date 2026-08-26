export const ORIENTATIONS = [0, 90, 180, 270];
export const LOCATOR_MIN_LENGTH = 12;
export const LOCATOR_MAX_LENGTH = 20;

function normalizedLocatorText(text = '') {
  return String(text).toUpperCase().replace(/[^A-Z0-9]/g, '');
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
    .map(({ bbox, confidence, text }) => {
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
        locatorText: normalizedLocatorText(text),
        locatorConfidence: Math.round(Number(confidence) || 0),
      };
    })
    .filter((crop) => crop.width > 0 && crop.height > 0);
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
