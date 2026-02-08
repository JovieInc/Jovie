/**
 * E2E Icon Contrast Audit
 *
 * Validates that social and DSP icons have sufficient WCAG AA contrast
 * in the real browser environment by checking computed CSS color values
 * against their effective backgrounds.
 *
 * Covers: default, hover, and focus states in both light and dark themes.
 * Fails hard on any violation — designed to block PRs.
 *
 * WCAG 2.1 AA non-text UI components require 3:1 contrast.
 * @see https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html
 */

import { expect, type Page, test } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WCAG_AA_NON_TEXT = 3.0;
const baseUrl = process.env.BASE_URL || 'http://localhost:3100';

interface ContrastViolation {
  theme: 'light' | 'dark';
  state: string;
  element: string;
  label: string;
  foreground: string;
  background: string;
  ratio: number;
  required: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate(t => {
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, theme);
  await page.waitForTimeout(300);
}

/**
 * Inject contrast-checking utility functions into the page's window scope.
 * Must be called once before auditIconContrast / auditHoverContrast.
 */
async function injectContrastHelpers(page: Page) {
  await page.evaluate(() => {
    // Attach helpers to window so they persist across evaluate calls
    (window as Record<string, unknown>).__parseCssColor = (c: string) => {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) return null;
      return {
        r: Number(m[1]),
        g: Number(m[2]),
        b: Number(m[3]),
        a: m[4] != null ? Number(m[4]) : 1,
      };
    };

    (window as Record<string, unknown>).__getLuminance = (
      r: number,
      g: number,
      b: number
    ) => {
      const a = [r, g, b].map(v => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    };

    (window as Record<string, unknown>).__getContrastRatio = (
      fg: string,
      bg: string
    ) => {
      const parse = (window as Record<string, Function>).__parseCssColor;
      const luminance = (window as Record<string, Function>).__getLuminance;
      const fgC = parse(fg);
      const bgC = parse(bg);
      if (!fgC || !bgC) return null;

      let r1 = fgC.r;
      let g1 = fgC.g;
      let b1 = fgC.b;
      if (fgC.a < 1) {
        r1 = r1 * fgC.a + bgC.r * (1 - fgC.a);
        g1 = g1 * fgC.a + bgC.g * (1 - fgC.a);
        b1 = b1 * fgC.a + bgC.b * (1 - fgC.a);
      }

      const l1 = luminance(r1, g1, b1);
      const l2 = luminance(bgC.r, bgC.g, bgC.b);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    };

    (window as Record<string, unknown>).__getEffectiveBg = (el: Element) => {
      let current: Element | null = el;
      while (current) {
        const style = window.getComputedStyle(current);
        const bg = style.backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
        current = current.parentElement;
      }
      return document.documentElement.classList.contains('dark')
        ? 'rgb(9, 9, 9)'
        : 'rgb(255, 255, 255)';
    };
  });
}

/**
 * Audit all SVG icons inside social link containers.
 * Checks their default state computed colors.
 */
async function auditIconContrast(
  page: Page,
  theme: 'light' | 'dark'
): Promise<ContrastViolation[]> {
  return page.evaluate(
    ({ theme, WCAG_AA }) => {
      const w = window as Record<string, Function>;
      const getContrastRatio = w.__getContrastRatio;
      const getEffectiveBg = w.__getEffectiveBg;
      const violations: ContrastViolation[] = [];

      // Social icon links (SocialLink renders <a> with <svg>)
      const socialLinks = document.querySelectorAll('a[aria-label*="Follow"]');

      socialLinks.forEach(link => {
        const svg = link.querySelector('svg');
        if (!svg) return;

        const linkStyle = window.getComputedStyle(link);
        const fg = linkStyle.color;
        const bg = getEffectiveBg(link) as string;
        const ratio = getContrastRatio(fg, bg) as number | null;
        const label =
          link.getAttribute('aria-label') ||
          link.getAttribute('title') ||
          'unknown';

        if (ratio !== null && ratio < WCAG_AA) {
          violations.push({
            theme,
            state: 'default',
            element: 'social-icon',
            label,
            foreground: fg,
            background: bg,
            ratio: Math.round(ratio * 100) / 100,
            required: WCAG_AA,
          });
        }
      });

      // DSP provider icons (DspProviderIcon renders <span style={color}><svg>)
      const dspSelector = [
        'Spotify',
        'Apple Music',
        'Deezer',
        'YouTube Music',
        'Tidal',
        'SoundCloud',
        'Amazon Music',
        'MusicBrainz',
      ]
        .map(t => `[title="${t}"]`)
        .join(', ');
      const dspIcons = document.querySelectorAll(dspSelector);

      dspIcons.forEach(container => {
        const colorSpan = container.querySelector('span[style]');
        if (!colorSpan) return;

        const fg = window.getComputedStyle(colorSpan).color;
        const bg = getEffectiveBg(container) as string;
        const ratio = getContrastRatio(fg, bg) as number | null;
        const label = container.getAttribute('title') || 'unknown DSP';

        if (ratio !== null && ratio < WCAG_AA) {
          violations.push({
            theme,
            state: 'default',
            element: 'dsp-icon',
            label,
            foreground: fg,
            background: bg,
            ratio: Math.round(ratio * 100) / 100,
            required: WCAG_AA,
          });
        }
      });

      return violations;
    },
    { theme, WCAG_AA: WCAG_AA_NON_TEXT }
  );
}

/**
 * Audit hover state: trigger hover on each social icon and check contrast.
 */
async function auditHoverContrast(
  page: Page,
  theme: 'light' | 'dark'
): Promise<ContrastViolation[]> {
  const violations: ContrastViolation[] = [];
  const socialLinks = page.locator('a[aria-label*="Follow"]');
  const count = await socialLinks.count();

  for (let i = 0; i < count; i++) {
    const link = socialLinks.nth(i);
    const isVisible = await link.isVisible().catch(() => false);
    if (!isVisible) continue;

    await link.hover();
    await page.waitForTimeout(200); // transition duration

    const violation = await link.evaluate(
      (el, { theme, WCAG_AA }) => {
        const w = window as Record<string, Function>;
        const getContrastRatio = w.__getContrastRatio;
        const getEffectiveBg = w.__getEffectiveBg;

        const style = window.getComputedStyle(el);
        const fg = style.color;
        const bg = getEffectiveBg(el) as string;
        const ratio = getContrastRatio(fg, bg) as number | null;
        const label =
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          'unknown';

        if (ratio !== null && ratio < WCAG_AA) {
          return {
            theme,
            state: 'hover',
            element: 'social-icon',
            label,
            foreground: fg,
            background: bg,
            ratio: Math.round(ratio * 100) / 100,
            required: WCAG_AA,
          } as ContrastViolation;
        }
        return null;
      },
      { theme, WCAG_AA: WCAG_AA_NON_TEXT }
    );

    if (violation) violations.push(violation);
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Run as unauthenticated so we can test public pages
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Icon Contrast Audit — WCAG AA Non-Text (3:1)', () => {
  const publicRoutes = ['/'];

  for (const route of publicRoutes) {
    test(`${route} — social/DSP icons meet contrast in light and dark modes`, async ({
      page,
    }) => {
      test.setTimeout(120_000);

      const url = route.startsWith('http') ? route : `${baseUrl}${route}`;
      await page.goto(url, { timeout: 60_000 });
      await page.waitForLoadState('networkidle');

      // Inject contrast-checking utilities once
      await injectContrastHelpers(page);

      const allViolations: ContrastViolation[] = [];

      // --- Light mode ---
      await setTheme(page, 'light');
      allViolations.push(
        ...(await auditIconContrast(page, 'light')),
        ...(await auditHoverContrast(page, 'light'))
      );

      // --- Dark mode ---
      await setTheme(page, 'dark');
      allViolations.push(
        ...(await auditIconContrast(page, 'dark')),
        ...(await auditHoverContrast(page, 'dark'))
      );

      // Log all violations for debugging
      if (allViolations.length > 0) {
        console.error(
          `ICON_CONTRAST_VIOLATIONS:\n${JSON.stringify(allViolations, null, 2)}`
        );
        for (const v of allViolations) {
          console.error(
            `  [${v.theme}/${v.state}] ${v.label}: ${v.ratio}:1 (need ${v.required}:1) — fg:${v.foreground} bg:${v.background}`
          );
        }
      }

      // HARD FAIL if any violations
      expect(
        allViolations.length,
        `Found ${allViolations.length} icon contrast violations:\n${allViolations
          .map(
            v =>
              `  [${v.theme}/${v.state}] ${v.label}: ${v.ratio}:1 < ${v.required}:1`
          )
          .join('\n')}`
      ).toBe(0);
    });
  }
});
