/**
 * OKLCH math for the JOV-5388 palette guard (Björn Ottosson OKLab).
 * @typedef {{ l: number, c: number, h: number, alpha?: number }} Oklch
 * @typedef {{ r: number, g: number, b: number, alpha?: number }} Rgb
 */

const OKLCH_RE =
  /^oklch\(\s*([+-]?(?:\d+\.?\d*|\.\d+)%?)\s+([+-]?(?:\d+\.?\d*|\.\d+))\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:deg)?)\s*(?:\/\s*([+-]?(?:\d+\.?\d*|\.\d+)%?))?\s*\)$/i;
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** @param {number} c */
export const srgbToLinear = c =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
/** @param {number} c */
export const linearToSrgb = c =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

/** @param {Rgb} rgb */
export function rgbToOklab(rgb) {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** @param {{ l: number, a: number, b: number }} lab */
export function oklabToRgb(lab) {
  const l = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const [l3, m3, s3] = [l ** 3, m ** 3, s ** 3];
  return {
    r: linearToSrgb(+4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    g: linearToSrgb(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    b: linearToSrgb(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
  };
}

/** @param {Rgb} rgb */
export function rgbToOklch(rgb) {
  const lab = rgbToOklab(rgb);
  const c = Math.hypot(lab.a, lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: lab.l, c, h: c < 1e-8 ? 0 : h, alpha: rgb.alpha };
}

/** @param {Oklch} oklch */
export function oklchToRgb(oklch) {
  const rad = ((oklch.h ?? 0) * Math.PI) / 180;
  const rgb = oklabToRgb({
    l: oklch.l,
    a: oklch.c * Math.cos(rad),
    b: oklch.c * Math.sin(rad),
  });
  rgb.alpha = oklch.alpha;
  return rgb;
}

/** @param {string} hex */
export function parseHex(hex) {
  const match = HEX_RE.exec(hex.trim());
  if (!match) throw new Error(`Invalid hex color: ${hex}`);
  let raw = match[1];
  if (raw.length <= 4) raw = [...raw].map(ch => ch + ch).join('');
  const int = Number.parseInt(raw.slice(0, 6), 16);
  /** @type {Rgb} */
  const rgb = {
    r: ((int >> 16) & 255) / 255,
    g: ((int >> 8) & 255) / 255,
    b: (int & 255) / 255,
  };
  if (raw.length === 8) rgb.alpha = Number.parseInt(raw.slice(6, 8), 16) / 255;
  return rgb;
}

/** @param {Rgb} rgb */
export function formatHex(rgb) {
  const byte = (/** @type {number} */ n) =>
    Math.round(Math.min(1, Math.max(0, n)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${byte(rgb.r)}${byte(rgb.g)}${byte(rgb.b)}`;
}

/** @param {string} value */
export function parseOklch(value) {
  const match = OKLCH_RE.exec(value.trim());
  if (!match) throw new Error(`Invalid OKLCH color: ${value}`);
  const l = match[1].endsWith('%')
    ? Number.parseFloat(match[1]) / 100
    : Number.parseFloat(match[1]);
  const c = Number.parseFloat(match[2]);
  const h = Number.parseFloat(match[3]);
  const alpha =
    match[4] === undefined
      ? undefined
      : match[4].endsWith('%')
        ? Number.parseFloat(match[4]) / 100
        : Number.parseFloat(match[4]);
  if (
    ![l, c, h, alpha ?? 1].every(Number.isFinite) ||
    l < 0 ||
    l > 1.05 ||
    c < 0
  ) {
    throw new Error(`OKLCH out of structural range: ${value}`);
  }
  return { l, c, h: ((h % 360) + 360) % 360, alpha };
}

/** @param {Oklch} oklch */
export function formatOklch(oklch) {
  const l = (oklch.l * 100).toFixed(1).replace(/\.0$/, '');
  const c = oklch.c.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  const h = oklch.h.toFixed(1).replace(/\.0$/, '');
  return oklch.alpha !== undefined && oklch.alpha < 1
    ? `oklch(${l}% ${c} ${h} / ${oklch.alpha})`
    : `oklch(${l}% ${c} ${h})`;
}

export const hexToOklch = (/** @type {string} */ hex) =>
  rgbToOklch(parseHex(hex));
export const oklchToHex = (/** @type {Oklch} */ oklch) =>
  formatHex(oklchToRgb(oklch));

/** @param {Oklch} oklch @param {number} [epsilon] */
export function isInSrgbGamut(oklch, epsilon = 0.002) {
  const rgb = oklchToRgb(oklch);
  return [rgb.r, rgb.g, rgb.b].every(n => n >= -epsilon && n <= 1 + epsilon);
}

/** @param {Rgb} rgb */
export function relativeLuminance(rgb) {
  return (
    0.2126 * srgbToLinear(rgb.r) +
    0.7152 * srgbToLinear(rgb.g) +
    0.0722 * srgbToLinear(rgb.b)
  );
}

/** @param {Oklch} a @param {Oklch} b */
export function contrastRatioOklch(a, b) {
  const [x, y] = [
    relativeLuminance(oklchToRgb(a)),
    relativeLuminance(oklchToRgb(b)),
  ];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** @param {Oklch} from @param {Oklch} to @param {number} t */
export function interpolateOklch(from, to, t) {
  let dh = to.h - from.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return {
    l: from.l + (to.l - from.l) * t,
    c: from.c + (to.c - from.c) * t,
    h: (((from.h + dh * t) % 360) + 360) % 360,
    alpha: (from.alpha ?? 1) + ((to.alpha ?? 1) - (from.alpha ?? 1)) * t,
  };
}

/** @param {Oklch[]} sequence @param {number} [epsilon] */
export function isMonotonicLightness(sequence, epsilon = 1e-6) {
  if (sequence.length < 2) return true;
  const deltas = sequence.slice(1).map((c, i) => c.l - sequence[i].l);
  return deltas.every(d => d >= -epsilon) || deltas.every(d => d <= epsilon);
}

/** @param {Oklch} a @param {Oklch} b */
export function hueDistance(a, b) {
  const d = Math.abs(a.h - b.h) % 360;
  return d > 180 ? 360 - d : d;
}

/** @param {string} a @param {string} b */
export const hexEquals = (a, b) =>
  formatHex(parseHex(a)) === formatHex(parseHex(b));
