/** Accent pack color families: palette words, hex/rgb hue families, color tokens. Pure: source text in, violation ids out. */

const PALETTE_WORDS =
  'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const UTILITY =
  'text|bg|border|from|via|to|ring|fill|stroke|outline|decoration|shadow|accent|divide|caret';
export const TAILWIND_PALETTE = new RegExp(
  `(?<![\\w-])(?:[\\w[\\]-]+:)*(${UTILITY})-(${PALETTE_WORDS})-(\\d{2,3})(?![\\w])`,
  'g'
);

/** word -> hue family */
const WORD_FAMILY = {
  red: 'red',
  rose: 'red',
  flare: 'red',
  orange: 'orange',
  amber: 'orange',
  gold: 'orange',
  yellow: 'yellow',
  lime: 'yellow',
  green: 'green',
  emerald: 'green',
  mint: 'green',
  aqua: 'green',
  teal: 'green',
  cyan: 'cyan',
  sky: 'cyan',
  blue: 'blue',
  ion: 'blue',
  indigo: 'blue',
  purple: 'purple',
  violet: 'purple',
  ultra: 'purple',
  pink: 'pink',
  fuchsia: 'pink',
  pulse: 'pink',
};
export const FAMILY_ACCENT = {
  blue: 'ion',
  purple: 'ultra',
  pink: 'pulse',
  orange: 'orange',
  green: 'mint',
  red: 'red',
};
export const accentOf = family => FAMILY_ACCENT[family] ?? family;

export function familyOfWords(text) {
  const words = String(text)
    .toLowerCase()
    .replace(/^noir-ion-/, '')
    .split(/[^a-z]+/);
  for (const word of words) if (WORD_FAMILY[word]) return WORD_FAMILY[word];
  return null;
}

function hueFamily(h) {
  if (h >= 345 || h < 15) return 'red';
  if (h < 45) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 165) return 'green';
  if (h < 200) return 'cyan';
  if (h < 255) return 'blue';
  if (h < 300) return 'purple';
  return 'pink';
}

function rgbFamily(r, g, b) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return null;
  const s = d / (1 - Math.abs(2 * l - 1));
  if (s < 0.35 || l < 0.15 || l > 0.92) return null;
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  let h;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return hueFamily((h * 60 + 360) % 360);
}

export function hexFamily(hex) {
  let body = hex.replace('#', '');
  if (body.length === 3 || body.length === 4)
    body = body
      .slice(0, 3)
      .split('')
      .map(c => c + c)
      .join('');
  if (body.length === 8) body = body.slice(0, 6);
  if (body.length !== 6 || /[^0-9a-f]/i.test(body)) return null;
  const n = Number.parseInt(body, 16);
  return rgbFamily((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

export const COLOR_TOKEN =
  /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|var\(--[a-z0-9-]+/gi;

export function oneColorFamily(token) {
  const t = token.toLowerCase();
  if (t.startsWith('#')) return hexFamily(t);
  if (t.startsWith('var(')) return familyOfWords(t.slice(6));
  const nums = (t.match(/-?\d*\.?\d+%?/g) ?? []).map(Number.parseFloat);
  if (t.startsWith('rgb'))
    return nums.length >= 3 ? rgbFamily(nums[0], nums[1], nums[2]) : null;
  if (t.startsWith('hsl')) {
    const [h, s, l] = nums;
    if (s === undefined || s < 35 || l < 15 || l > 92) return null;
    return hueFamily(((h % 360) + 360) % 360);
  }
  if (t.startsWith('oklch')) {
    const [, c, h] = nums;
    if (c === undefined || c < 0.07 || h === undefined) return null;
    const hh = ((h % 360) + 360) % 360;
    if (hh < 20 || hh >= 345) return 'red';
    if (hh < 70) return 'orange';
    if (hh < 110) return 'yellow';
    if (hh < 175) return 'green';
    if (hh < 225) return 'cyan';
    if (hh < 265) return 'blue';
    if (hh < 320) return 'purple';
    return 'pink';
  }
  return null;
}

/** Hue families named in one CSS or Tailwind value, in order, deduplicated. */
export function colorFamilies(value) {
  const out = [];
  const text = String(value);
  for (const match of text.matchAll(COLOR_TOKEN)) {
    const family = oneColorFamily(match[0]);
    if (family && !out.includes(family)) out.push(family);
  }
  // Tailwind names inside the value: from-blue-500, bg-accent-purple, ion.
  if (!out.length) {
    const family = familyOfWords(text.replace(/\d+/g, ' '));
    if (family) out.push(family);
  }
  return out;
}

/* ------------------------------------------------------------- tokenizer */
