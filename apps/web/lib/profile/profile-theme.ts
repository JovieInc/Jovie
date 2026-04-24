import {
  darkenHex,
  getContrastTextOnBrand,
  hexToRgb,
  hexToRgba,
  lightenHex,
} from '@/lib/utils/color';

export interface ProfileAccentTheme {
  readonly version: 1;
  readonly primaryHex: string;
  readonly sourceUrl: string;
  readonly generatedAt?: string;
}

export interface ProfileThemeRecord extends Record<string, unknown> {
  mode?: string;
  preference?: string;
  highContrast?: boolean;
  profileAccent?: ProfileAccentTheme | null;
}

export type ProfileAccentCssVars = Record<`--${string}`, string>;

const HEX_COLOR_PATTERN = /^#?([0-9a-f]{6})$/i;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map(channel =>
      clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')
    )
    .join('')}`;
}

function rgbToHsl(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness };
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));

  let hue: number;
  switch (max) {
    case rn:
      hue = ((gn - bn) / delta) % 6;
      break;
    case gn:
      hue = (bn - rn) / delta + 2;
      break;
    default:
      hue = (rn - gn) / delta + 4;
      break;
  }

  return {
    h: (hue * 60 + 360) % 360,
    s: saturation,
    l: lightness,
  };
}

function hueToChannel(p: number, q: number, t: number): number {
  let normalized = t;
  if (normalized < 0) normalized += 1;
  if (normalized > 1) normalized -= 1;
  if (normalized < 1 / 6) return p + (q - p) * 6 * normalized;
  if (normalized < 1 / 2) return q;
  if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6;
  return p;
}

function hslToHex(h: number, s: number, l: number): string {
  if (s === 0) {
    const gray = Math.round(l * 255);
    return rgbToHex(gray, gray, gray);
  }

  const hue = h / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hueToChannel(p, q, hue + 1 / 3);
  const g = hueToChannel(p, q, hue);
  const b = hueToChannel(p, q, hue - 1 / 3);

  return rgbToHex(r * 255, g * 255, b * 255);
}

export function normalizeHexColor(
  hex: string | null | undefined
): string | null {
  if (!hex) return null;
  const match = HEX_COLOR_PATTERN.exec(hex.trim());
  if (!match) return null;
  return `#${match[1].toLowerCase()}`;
}

export function readProfileAccentTheme(
  theme: Record<string, unknown> | null | undefined
): ProfileAccentTheme | null {
  const accent = theme?.profileAccent;
  if (!accent || typeof accent !== 'object' || Array.isArray(accent)) {
    return null;
  }
  const accentRecord = accent as Record<string, unknown>;

  const sourceUrl =
    typeof accentRecord.sourceUrl === 'string' &&
    accentRecord.sourceUrl.trim().length > 0
      ? accentRecord.sourceUrl.trim()
      : null;
  const primaryHex = normalizeHexColor(
    typeof accentRecord.primaryHex === 'string' ? accentRecord.primaryHex : null
  );

  if (!sourceUrl || !primaryHex) {
    return null;
  }

  return {
    version: 1,
    primaryHex,
    sourceUrl,
    generatedAt:
      typeof accentRecord.generatedAt === 'string'
        ? accentRecord.generatedAt
        : undefined,
  };
}

export function mergeProfileTheme(
  existingTheme: Record<string, unknown> | null | undefined,
  updates: Partial<ProfileThemeRecord>
): ProfileThemeRecord {
  const merged = {
    ...(existingTheme ?? {}),
    ...updates,
  } as ProfileThemeRecord;

  if (updates.profileAccent === undefined) {
    const existingAccent = readProfileAccentTheme(existingTheme);
    if (existingAccent) {
      merged.profileAccent = existingAccent;
    }
  } else if (updates.profileAccent === null) {
    merged.profileAccent = null;
  } else {
    const normalizedAccent = readProfileAccentTheme({
      profileAccent: updates.profileAccent,
    });
    if (normalizedAccent) {
      merged.profileAccent = normalizedAccent;
    }
  }

  return merged;
}

export function normalizeProfileAccentHex(hex: string): string {
  const normalizedHex = normalizeHexColor(hex);
  if (!normalizedHex) {
    return '#d18a4f';
  }

  const { h, s, l } = rgbToHsl(normalizedHex);
  const adjustedSaturation = clamp(Math.max(s, 0.34), 0.34, 0.78);
  const adjustedLightness = clamp(
    l < 0.34 ? 0.46 : l > 0.68 ? 0.58 : l,
    0.42,
    0.62
  );

  return hslToHex(h, adjustedSaturation, adjustedLightness);
}

export function buildProfileAccentCssVars(
  accent: ProfileAccentTheme | null | undefined
): ProfileAccentCssVars {
  if (!accent) {
    return {};
  }

  const primaryHex = normalizeProfileAccentHex(accent.primaryHex);
  const contrastHex = getContrastTextOnBrand(primaryHex);
  const glowStrong = lightenHex(primaryHex, 0.32);
  const glowSoft = darkenHex(primaryHex, 0.82);

  return {
    '--profile-accent-primary': primaryHex,
    '--profile-accent-on-primary': contrastHex,
    '--profile-accent-soft': hexToRgba(primaryHex, 0.12),
    '--profile-accent-soft-strong': hexToRgba(primaryHex, 0.18),
    '--profile-tab-active-bg': primaryHex,
    '--profile-tab-active-fg': contrastHex,
    '--profile-status-pill-bg': hexToRgba(primaryHex, 0.18),
    '--profile-status-pill-border': hexToRgba(primaryHex, 0.28),
    '--profile-status-pill-fg': '#ffffff',
    '--profile-rail-dot-active': primaryHex,
    '--profile-rail-dot-inactive': hexToRgba(primaryHex, 0.18),
    '--profile-stage-glow-a': hexToRgba(glowStrong, 0.24),
    '--profile-stage-glow-b': hexToRgba(glowSoft, 0.14),
    '--profile-panel-gradient': `linear-gradient(180deg, ${hexToRgba(
      glowStrong,
      0.08
    )}, ${hexToRgba(primaryHex, 0.02)} 24%, transparent 100%)`,
    '--profile-pearl-primary-bg': primaryHex,
    '--profile-pearl-primary-fg': contrastHex,
    '--profile-pearl-bg': hexToRgba(primaryHex, 0.1),
    '--profile-pearl-bg-hover': hexToRgba(primaryHex, 0.14),
    '--profile-pearl-bg-active': hexToRgba(primaryHex, 0.2),
    '--profile-pearl-border': hexToRgba(primaryHex, 0.22),
    '--profile-composer-border': hexToRgba(primaryHex, 0.16),
    '--profile-dock-border': hexToRgba(primaryHex, 0.12),
    '--profile-dock-bg': hexToRgba(primaryHex, 0.08),
    '--color-focus-ring': primaryHex,
  };
}
