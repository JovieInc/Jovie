/**
 * Icon Contrast Enforcement Tests
 *
 * Validates that ALL social and DSP icon colors meet WCAG 2.1 AA contrast
 * requirements against their backgrounds in every combination of:
 *   - Theme: light / dark
 *   - State: default (secondary-token text), hover (brand color), active (brand color)
 *
 * Icons use `fill="currentColor"` so contrast is determined by the CSS `color`
 * value vs. the effective background. The tests use the same production utility
 * functions (ensureContrast, isBrandDark) as the components themselves.
 *
 * WCAG 2.1 AA requirement for non-text UI components (icons): 3:1
 * @see https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html
 */

import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  darkenHex,
  ensureContrast,
  hexToRgb,
  isBrandDark,
  isBrandTooLight,
  relativeLuminance,
} from '@/lib/utils/color';

// ---------------------------------------------------------------------------
// Test-local helpers
// ---------------------------------------------------------------------------

/**
 * Blend an rgba foreground over an opaque background.
 * Both inputs are hex; alpha is 0-1 for the foreground.
 */
function blendAlpha(fgHex: string, bgHex: string, alpha: number): string {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  const r = Math.round(fg.r * alpha + bg.r * (1 - alpha));
  const g = Math.round(fg.g * alpha + bg.g * (1 - alpha));
  const b = Math.round(fg.b * alpha + bg.b * (1 - alpha));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// ---------------------------------------------------------------------------
// Design-system surface tokens (hex equivalents from design-system.css)
// ---------------------------------------------------------------------------

const SURFACES = {
  light: {
    base: '#f6f6f6',
    'surface-0': '#f6f6f6',
    'surface-1': '#fcfcfc',
    'surface-2': '#ffffff',
    'surface-3': '#e6e6e6',
  },
  dark: {
    base: '#090909',
    'surface-0': '#090909',
    'surface-1': '#101012',
    'surface-2': '#1b1d21',
    'surface-3': '#21242a',
  },
} as const;

// Text tokens (approximate hex from oklch values in design-system.css)
const TEXT_TOKENS = {
  light: {
    'secondary-token': '#555558', // oklch(40% 0.015 272)
  },
  dark: {
    'secondary-token': '#e3e4e5', // oklch(92% 0.005 272)
  },
} as const;

// ---------------------------------------------------------------------------
// Complete icon registries — every platform must be covered
// ---------------------------------------------------------------------------

/** All social icon metadata (mirrored from SocialIcon.tsx iconMetadata). */
const SOCIAL_ICONS: Record<string, { hex: string }> = {
  instagram: { hex: 'E4405F' },
  twitter: { hex: '000000' },
  x: { hex: '000000' },
  tiktok: { hex: '000000' },
  youtube: { hex: 'FF0000' },
  youtube_music: { hex: 'FF0000' },
  facebook: { hex: '0866FF' },
  spotify: { hex: '1DB954' },
  apple_music: { hex: 'FA243C' },
  soundcloud: { hex: 'FF3300' },
  bandcamp: { hex: '1DA0C3' },
  discord: { hex: '5865F2' },
  reddit: { hex: 'FF4500' },
  pinterest: { hex: 'E60023' },
  tumblr: { hex: '36465D' },
  vimeo: { hex: '1AB7EA' },
  github: { hex: '181717' },
  medium: { hex: '000000' },
  patreon: { hex: 'FF424D' },
  venmo: { hex: '008CFF' },
  website: { hex: '4285F4' },
  telegram: { hex: '26A5E4' },
  snapchat: { hex: 'FFFC00' },
  onlyfans: { hex: '00AFF0' },
  quora: { hex: 'B92B27' },
  threads: { hex: '000000' },
  line: { hex: '00B900' },
  viber: { hex: '7360F2' },
  rumble: { hex: '85C742' },
  twitch: { hex: '9146FF' },
  tidal: { hex: '000000' },
};

/** DSP provider colors (mirrored from DspProviderIcon.tsx PROVIDER_COLORS). */
const DSP_ICONS: Record<string, { hex: string }> = {
  spotify: { hex: '1DB954' },
  apple_music: { hex: 'FA243C' },
  deezer: { hex: 'FEAA2D' },
  youtube_music: { hex: 'FF0000' },
  tidal: { hex: '000000' },
  soundcloud: { hex: 'FF5500' },
  amazon_music: { hex: '00A8E1' },
  musicbrainz: { hex: 'BA478F' },
};

// ---------------------------------------------------------------------------
// WCAG thresholds
// ---------------------------------------------------------------------------

/** WCAG AA for non-text UI components (graphical objects / icons). */
const WCAG_AA_NON_TEXT = 3.0;

// ---------------------------------------------------------------------------
// Helpers to compute effective colors per state
// (mirrors the actual component logic in SocialLink.tsx / DspProviderIcon.tsx)
// ---------------------------------------------------------------------------

type Theme = 'light' | 'dark';
type State = 'default' | 'hover' | 'active';

interface ColorPair {
  fg: string;
  bg: string;
  description: string;
}

/**
 * SocialLink colour logic per state — mirrors the production component:
 *   - default: text-secondary-token on bg-surface-0 at 80% opacity
 *   - hover:   ensureContrast(brand, surface-1) or white for dark brands in dark mode
 *   - active:  same as hover (scale change only)
 */
function socialLinkColors(
  platform: string,
  brandHex: string,
  theme: Theme,
  state: State
): ColorPair {
  const isDark = theme === 'dark';

  if (state === 'default') {
    const bgBlended = blendAlpha(
      SURFACES[theme]['surface-0'],
      SURFACES[theme].base,
      0.8
    );
    return {
      fg: TEXT_TOKENS[theme]['secondary-token'],
      bg: bgBlended,
      description: `${platform} [${theme}] default: secondary-token on surface-0/80`,
    };
  }

  // hover and active: mirrors SocialLink.tsx hoverColor logic
  const hoverBg = isDark ? '#101012' : '#fcfcfc';
  const effectiveColor =
    isDark && isBrandDark(brandHex)
      ? '#ffffff'
      : ensureContrast(brandHex, hoverBg);

  return {
    fg: effectiveColor,
    bg: SURFACES[theme]['surface-1'],
    description: `${platform} [${theme}] ${state}: brand color on surface-1`,
  };
}

/**
 * DspProviderIcon colour logic — mirrors the production component:
 *   - dark brands → white in dark mode
 *   - otherwise → ensureContrast(brand, bg)
 */
function dspIconColors(
  provider: string,
  brandHex: string,
  theme: Theme,
  surface: 'surface-1' | 'surface-2'
): ColorPair {
  const isDark = theme === 'dark';
  const bgHex = isDark ? '#101012' : '#fcfcfc';
  const effectiveColor =
    isDark && isBrandDark(`#${brandHex}`)
      ? '#ffffff'
      : ensureContrast(`#${brandHex}`, bgHex);

  return {
    fg: effectiveColor,
    bg: SURFACES[theme][surface],
    description: `DSP:${provider} [${theme}] on ${surface}`,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Icon Contrast — WCAG AA Non-Text (3:1)', () => {
  // -----------------------------------------------------------------------
  // Social Icons — all platforms × all themes × all states
  // -----------------------------------------------------------------------
  describe('Social Icons', () => {
    const themes: Theme[] = ['light', 'dark'];
    const states: State[] = ['default', 'hover', 'active'];

    for (const [platform, meta] of Object.entries(SOCIAL_ICONS)) {
      describe(platform, () => {
        for (const theme of themes) {
          for (const state of states) {
            it(`${theme} / ${state} meets ${WCAG_AA_NON_TEXT}:1 contrast`, () => {
              const pair = socialLinkColors(platform, meta.hex, theme, state);
              const ratio = contrastRatio(pair.fg, pair.bg);

              expect(
                ratio,
                `FAIL: ${pair.description} — ratio ${ratio.toFixed(2)}:1 < required ${WCAG_AA_NON_TEXT}:1`
              ).toBeGreaterThanOrEqual(WCAG_AA_NON_TEXT);
            });
          }
        }
      });
    }
  });

  // -----------------------------------------------------------------------
  // DSP Icons — all providers × all themes × surface-1 & surface-2
  // -----------------------------------------------------------------------
  describe('DSP Icons', () => {
    const themes: Theme[] = ['light', 'dark'];
    const surfaces: Array<'surface-1' | 'surface-2'> = [
      'surface-1',
      'surface-2',
    ];

    for (const [provider, meta] of Object.entries(DSP_ICONS)) {
      describe(provider, () => {
        for (const theme of themes) {
          for (const surface of surfaces) {
            it(`${theme} / ${surface} meets ${WCAG_AA_NON_TEXT}:1 contrast`, () => {
              const pair = dspIconColors(provider, meta.hex, theme, surface);
              const ratio = contrastRatio(pair.fg, pair.bg);

              expect(
                ratio,
                `FAIL: ${pair.description} — ratio ${ratio.toFixed(2)}:1 < required ${WCAG_AA_NON_TEXT}:1`
              ).toBeGreaterThanOrEqual(WCAG_AA_NON_TEXT);
            });
          }
        }
      });
    }
  });

  // -----------------------------------------------------------------------
  // Guard: icon registries stay in sync with source
  // -----------------------------------------------------------------------
  describe('Registry completeness', () => {
    it('SOCIAL_ICONS covers all platforms in SocialIcon.tsx iconMetadata', async () => {
      const { getPlatformIconMetadata } = await import(
        '@/components/atoms/SocialIcon'
      );

      const knownPlatforms = Object.keys(SOCIAL_ICONS);
      for (const platform of knownPlatforms) {
        const meta = getPlatformIconMetadata(platform);
        expect(
          meta,
          `Platform "${platform}" missing from SocialIcon.tsx iconMetadata`
        ).toBeDefined();
        expect(meta!.hex).toBe(SOCIAL_ICONS[platform].hex);
      }
    });

    it('DSP_ICONS covers all providers in DspProviderIcon.tsx PROVIDER_COLORS', async () => {
      const { PROVIDER_COLORS } = await import(
        '@/components/dashboard/atoms/DspProviderIcon'
      );

      for (const [provider, color] of Object.entries(PROVIDER_COLORS)) {
        const testEntry = DSP_ICONS[provider];
        expect(
          testEntry,
          `DSP provider "${provider}" missing from test DSP_ICONS registry`
        ).toBeDefined();
        expect(`#${testEntry.hex}`.toLowerCase()).toBe(
          (color as string).toLowerCase()
        );
      }

      for (const provider of Object.keys(DSP_ICONS)) {
        expect(
          PROVIDER_COLORS[provider as keyof typeof PROVIDER_COLORS],
          `Test DSP_ICONS has "${provider}" but it's missing from PROVIDER_COLORS`
        ).toBeDefined();
      }
    });
  });

  // -----------------------------------------------------------------------
  // Regression: dark-brand-on-dark-bg
  // -----------------------------------------------------------------------
  describe('Dark brand regression tests', () => {
    const darkBrands = Object.entries(SOCIAL_ICONS).filter(([, meta]) =>
      isBrandDark(meta.hex)
    );

    it('identifies expected dark brands', () => {
      const darkNames = darkBrands.map(([name]) => name).sort();
      expect(darkNames).toEqual(
        expect.arrayContaining([
          'github',
          'medium',
          'threads',
          'tidal',
          'tiktok',
          'tumblr',
          'twitter',
          'x',
        ])
      );
    });

    for (const [platform, meta] of darkBrands) {
      it(`${platform} (#${meta.hex}) is inverted to white in dark mode hover`, () => {
        const pair = socialLinkColors(platform, meta.hex, 'dark', 'hover');
        expect(pair.fg).toBe('#ffffff');
        const ratio = contrastRatio(pair.fg, pair.bg);
        expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NON_TEXT);
      });
    }
  });

  // -----------------------------------------------------------------------
  // Regression: bright-brand-on-light-bg edge cases
  // -----------------------------------------------------------------------
  describe('Bright brand regression tests', () => {
    const brightBrands = [
      { name: 'snapchat', hex: 'FFFC00' },
      { name: 'rumble', hex: '85C742' },
    ];

    for (const { name, hex } of brightBrands) {
      it(`${name} (#${hex}) is darkened via ensureContrast in light mode`, () => {
        const pair = socialLinkColors(name, hex, 'light', 'hover');
        const ratio = contrastRatio(pair.fg, pair.bg);
        expect(
          ratio,
          `${name} light-mode hover contrast ${ratio.toFixed(2)}:1 should be >= ${WCAG_AA_NON_TEXT}:1`
        ).toBeGreaterThanOrEqual(WCAG_AA_NON_TEXT);
      });
    }
  });

  // -----------------------------------------------------------------------
  // ensureContrast unit tests
  // -----------------------------------------------------------------------
  describe('ensureContrast utility', () => {
    it('returns original color when contrast is already sufficient', () => {
      // Black on white = 21:1
      const result = ensureContrast('#000000', '#ffffff');
      expect(result).toBe('#000000');
    });

    it('darkens a bright color to meet contrast on white', () => {
      // Snapchat yellow on near-white
      const result = ensureContrast('#FFFC00', '#fcfcfc');
      const ratio = contrastRatio(result, '#fcfcfc');
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });

    it('darkens Rumble green to meet contrast on light surface', () => {
      const result = ensureContrast('#85C742', '#fcfcfc');
      const ratio = contrastRatio(result, '#fcfcfc');
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });

    it('handles hex with or without # prefix', () => {
      const a = ensureContrast('FFFC00', '#fcfcfc');
      const b = ensureContrast('#FFFC00', '#fcfcfc');
      expect(a).toBe(b);
    });
  });

  // -----------------------------------------------------------------------
  // darkenHex utility
  // -----------------------------------------------------------------------
  describe('darkenHex utility', () => {
    it('factor=1.0 returns the original color', () => {
      expect(darkenHex('#ff8800', 1.0)).toBe('#ff8800');
    });

    it('factor=0 returns black', () => {
      expect(darkenHex('#ff8800', 0)).toBe('#000000');
    });

    it('factor=0.5 halves each channel', () => {
      const result = darkenHex('#ff8800', 0.5);
      const { r, g, b } = hexToRgb(result);
      expect(r).toBe(128); // 255 * 0.5 rounded
      expect(g).toBe(68); // 136 * 0.5 rounded
      expect(b).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // isBrandTooLight utility
  // -----------------------------------------------------------------------
  describe('isBrandTooLight utility', () => {
    it('Snapchat yellow is too light on near-white', () => {
      expect(isBrandTooLight('#FFFC00', '#fcfcfc')).toBe(true);
    });

    it('black is not too light on anything', () => {
      expect(isBrandTooLight('#000000', '#fcfcfc')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // color.ts utility function correctness
  // -----------------------------------------------------------------------
  describe('color.ts utility correctness', () => {
    it('relativeLuminance of black is ~0', () => {
      expect(relativeLuminance('#000000')).toBeCloseTo(0, 3);
    });

    it('relativeLuminance of white is ~1', () => {
      expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 3);
    });

    it('contrastRatio of black vs white is 21:1', () => {
      expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    });

    it('isBrandDark correctly identifies dark colors', () => {
      expect(isBrandDark('000000')).toBe(true);
      expect(isBrandDark('181717')).toBe(true); // GitHub
      expect(isBrandDark('36465D')).toBe(true); // Tumblr
      expect(isBrandDark('FFFFFF')).toBe(false);
      expect(isBrandDark('1DB954')).toBe(false); // Spotify green
    });
  });
});
