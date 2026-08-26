export const ORIENTATIONS = [0, 90, 270, 180];
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

export function isSerialNumberLabel(text = '') {
  return String(text).replace(/[\s\u3000]/g, '').includes('シリアルナン');
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
        lineBox: { x0: bbox.x0, y0: bbox.y0, x1: bbox.x1, y1: bbox.y1 },
        ambiguousGlyphs: locatorSymbols(line, text)
          .filter((symbol) => (symbol.value === '2' || symbol.value === 'Z') && symbol.bbox),
      };
    })
    .filter((crop) => crop.width > 0 && crop.height > 0);
}

export function serialLabelCrop(crop, width, height) {
  const box = crop.lineBox;
  const lineWidth = box.x1 - box.x0;
  const lineHeight = box.y1 - box.y0;
  const x = Math.max(0, Math.floor(box.x0 - (lineHeight * 0.5)));
  const y = Math.max(0, Math.floor(box.y0 - (lineHeight * 0.35)));
  const x1 = Math.min(width, Math.ceil(box.x0 + (lineWidth * 0.55)));
  const y1 = Math.min(height, Math.ceil(box.y0 + (lineHeight * 0.25)));
  return { x, y, width: x1 - x, height: y1 - y };
}

export function serialReviewCrop(crop, width, height) {
  const label = serialLabelCrop(crop, width, height);
  const box = crop.lineBox;
  const lineHeight = box.y1 - box.y0;
  const x = label.x;
  const y = label.y;
  const x1 = Math.min(width, Math.ceil(box.x1 + (lineHeight * 0.2)));
  const y1 = Math.min(height, Math.ceil(box.y1 + (lineHeight * 0.2)));
  return { x, y, width: x1 - x, height: y1 - y };
}

export function hasExactLocatorSerial(crops) {
  return (crops ?? []).some((crop) => /^[A-Z0-9]{16}$/.test(crop.locatorText));
}

export function applyGlyphResolutions(code, resolutions) {
  const characters = String(code).split('');
  for (const resolution of resolutions ?? []) {
    if ((characters[resolution.index] === '2' || characters[resolution.index] === 'Z')
      && (resolution.value === '2' || resolution.value === 'Z')) {
      characters[resolution.index] = resolution.value;
    }
  }
  return characters.join('');
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
