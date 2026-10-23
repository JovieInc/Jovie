/**
 * Scene Palette v1 accents and the orange-hue test used by the art-direction
 * gates. Ion / Ultra / Pulse hexes match apps/web/data/marketing/imageColorPolicy.ts.
 * UI anchors are the same roles, not a second accent.
 */

export const ACCENT_HEX = Object.freeze({
  '#3faff3': 'ion',
  '#11afff': 'ion',
  '#a789f0': 'ultra',
  '#8e56f5': 'ultra',
  '#eb6ac6': 'pulse',
  '#f52bb5': 'pulse',
});

/** Orange hue band. Saturation and lightness floors keep brown shadows out. */
export const ORANGE_HUE = Object.freeze({ min: 18, max: 48 });
export const ORANGE_SAT_MIN = 0.45;
export const ORANGE_LIGHTNESS = Object.freeze({ min: 0.15, max: 0.92 });

const ROLE_SOURCE = [
  ['ultra', /--noir-ion-ultra\b|--color-accent-purple\b|data-accent\s*=\s*['"](?:ultra|purple)['"]/],
  ['pulse', /--noir-ion-pulse\b|--color-accent-pink\b|data-accent\s*=\s*['"](?:pulse|pink)['"]/],
  ['ion', /--color-accent-blue\b|--system-b-accent-cyan\b|data-accent\s*=\s*['"](?:ion|blue)['"]/],
];

const NAMED_ORANGE =
  /--color-accent-orange\b|--noir-ion-orange\b|--noir-ion-gold\b|data-accent\s*=\s*['"]orange['"]|\baccent:\s*['"]orange['"]/;

export function normalizeHex(hex) {
  let body = String(hex).replace('#', '').trim();
  if (body.length === 3 || body.length === 4) {
    body = body
      .slice(0, 3)
      .split('')
      .map(char => char + char)
      .join('');
  } else if (body.length === 8) {
    body = body.slice(0, 6);
  }
  if (body.length !== 6 || /[^0-9a-f]/i.test(body)) return null;
  return `#${body.toLowerCase()}`;
}

export function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const value = Number.parseInt(normalized.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

export function rgbToHsl(r, g, b) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l: lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { h: hue, s: saturation, l: lightness };
}

export function accentRoleFromHex(hex) {
  const normalized = normalizeHex(hex);
  return normalized ? (ACCENT_HEX[normalized] ?? null) : null;
}

export function isOrangeHex(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  return (
    h >= ORANGE_HUE.min &&
    h <= ORANGE_HUE.max &&
    s >= ORANGE_SAT_MIN &&
    l >= ORANGE_LIGHTNESS.min &&
    l <= ORANGE_LIGHTNESS.max
  );
}

export function collectHexes(source) {
  return source.match(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g) ?? [];
}

/** @returns {{ roles: string[], oranges: string[] }} */
export function collectAccentSignals(source) {
  const roles = new Set();
  const oranges = [];
  for (const hex of collectHexes(source)) {
    const role = accentRoleFromHex(hex);
    if (role) roles.add(role);
    else if (isOrangeHex(hex)) oranges.push(normalizeHex(hex));
  }
  for (const [role, pattern] of ROLE_SOURCE) {
    if (pattern.test(source)) roles.add(role);
  }
  if (NAMED_ORANGE.test(source)) oranges.push('named:orange');
  return {
    roles: [...roles].sort(),
    oranges: [...new Set(oranges)],
  };
}
