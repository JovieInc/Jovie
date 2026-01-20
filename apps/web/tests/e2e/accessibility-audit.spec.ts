import { expect, Page, test } from '@playwright/test';
import { signInUser } from '../helpers/clerk-auth';

const baseUrl = process.env.BASE_URL || 'http://localhost:3100';

type Issue = {
  theme: 'light' | 'dark' | 'both';
  page: string;
  location: string;
  elementType: string;
  state: string;
  textOrIcon: string;
  foregroundColor: string;
  backgroundColor: string;
  contrastRatio: string;
  severity: 'minor' | 'moderate' | 'major';
  suggestedFix: string;
};

const issues: Issue[] = [];

// Helper function to calculate relative luminance
function getLuminance(r: number, g: number, b: number) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function _getContrastRatio(fg: string, bg: string) {
  const parseColor = (c: string) => {
    const match = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return null;
    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
  };

  const fgRgb = parseColor(fg);
  const bgRgb = parseColor(bg);

  if (!fgRgb || !bgRgb) return null;

  const fgL = getLuminance(fgRgb[0], fgRgb[1], fgRgb[2]);
  const bgL = getLuminance(bgRgb[0], bgRgb[1], bgRgb[2]);

  const l1 = Math.max(fgL, bgL);
  const l2 = Math.min(fgL, bgL);

  return (l1 + 0.05) / (l2 + 0.05);
}

function _getSeverity(ratio: number, isLargeText: boolean) {
  const required = isLargeText ? 3 : 4.5;
  if (ratio >= required) return 'pass';
  if (ratio < 1.5) return 'major';
  if (ratio < 3) {
    return isLargeText ? 'moderate' : 'major';
  }
  return 'minor';
}

async function auditPage(page: Page, theme: 'light' | 'dark', route: string) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  const violations = await page.evaluate(
    ({ theme, route }) => {
      const results: any[] = [];

      function isVisible(el: Element) {
        const style = window.getComputedStyle(el);
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          parseFloat(style.opacity) > 0
        );
      }

      function getEffectiveBackgroundColor(el: Element): string {
        let current: Element | null = el;
        while (current) {
          const style = window.getComputedStyle(current);
          const bg = style.backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
            return bg;
          }
          current = current.parentElement;
        }
        return 'rgb(255, 255, 255)';
      }

      const textElements = document.querySelectorAll(
        'h1, h2, h3, h4, h5, h6, p, span, a, button, label, input, td, th'
      );

      textElements.forEach(el => {
        if (!isVisible(el)) return;

        const style = window.getComputedStyle(el);
        const text = el.textContent?.trim();
        if (!text) return;

        const fontSize = parseFloat(style.fontSize);
        const fontWeight = style.fontWeight;
        const isBold = parseInt(fontWeight) >= 700 || fontWeight === 'bold';
        const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && isBold);

        const fg = style.color;
        const bg = getEffectiveBackgroundColor(el);

        const parseColor = (c: string) => {
          const match = c.match(
            /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
          );
          if (!match) return null;
          return [
            parseInt(match[1]),
            parseInt(match[2]),
            parseInt(match[3]),
            match[4] ? parseFloat(match[4]) : 1,
          ];
        };

        const getLuminance = (r: number, g: number, b: number) => {
          const a = [r, g, b].map(v => {
            v /= 255;
            return v <= 0.03928
              ? v / 12.92
              : Math.pow((v + 0.055) / 1.055, 2.4);
          });
          return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
        };

        const fgC = parseColor(fg);
        const bgC = parseColor(bg);

        if (fgC && bgC) {
          let r1 = fgC[0],
            g1 = fgC[1],
            b1 = fgC[2],
            a1 = fgC[3];
          let r2 = bgC[0],
            g2 = bgC[1],
            b2 = bgC[2];

          if (a1 < 1) {
            r1 = r1 * a1 + r2 * (1 - a1);
            g1 = g1 * a1 + g2 * (1 - a1);
            b1 = b1 * a1 + b2 * (1 - a1);
          }

          const l1 = getLuminance(r1, g1, b1);
          const l2 = getLuminance(r2, g2, b2);
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

          const required = isLargeText ? 3 : 4.5;
          if (ratio < required) {
            let location = 'Unknown';
            const closestContainer = el.closest(
              'header, nav, main, aside, footer, .card, [role="dialog"]'
            );
            if (closestContainer) {
              location =
                closestContainer.tagName.toLowerCase() +
                (closestContainer.className
                  ? '.' + closestContainer.className.split(' ')[0]
                  : '');
            }

            let severity: 'minor' | 'moderate' | 'major';
            if (ratio >= 3) {
              severity = 'minor';
            } else if (isLargeText) {
              severity = 'moderate';
            } else {
              severity = 'major';
            }

            results.push({
              page: route,
              location: location,
              elementType: el.tagName.toLowerCase(),
              state: 'default',
              textOrIcon: text.substring(0, 50),
              foregroundColor: fg,
              backgroundColor: bg,
              contrastRatio: ratio.toFixed(2),
              requiredRatio: required,
              severity,
              suggestedFix: `Increase contrast to at least ${required}:1`,
            });
          }
        }
      });
      return results;
    },
    { theme, route }
  );

  violations.forEach((v: any) => {
    issues.push({
      theme: theme,
      page: v.page,
      location: v.location,
      elementType: v.elementType,
      state: v.state,
      textOrIcon: v.textOrIcon,
      foregroundColor: v.foregroundColor,
      backgroundColor: v.backgroundColor,
      contrastRatio: `${v.contrastRatio}:1`,
      severity: v.severity,
      suggestedFix: v.suggestedFix,
    });
  });
}

test.describe('Accessibility Audit', () => {
  // Use a signed-in session if available
  // test.beforeEach(async ({ page }) => {
  //   await signInUser(page);
  // });

  test('Check contrast in light and dark modes across key pages', async ({
    page,
  }) => {
    test.setTimeout(180000);

    // Public pages (no auth required)
    const publicRoutes = ['/', '/signin', '/signup', '/pricing'];

    // Dashboard/admin pages (require auth - will be skipped if not signed in)
    const _authRoutes = [
      '/app/dashboard',
      '/app/settings',
      '/app/dashboard/links',
      '/account',
      '/app/admin/creators',
      '/app/admin/users',
      '/app/admin/activity',
      '/app/admin',
      '/app/dashboard/analytics',
      '/app/dashboard/audience',
      '/app/dashboard/contacts',
      '/app/dashboard/earnings',
    ];

    const routes = publicRoutes;

    // Helper to force theme via class (more reliable than finding switch)
    async function setTheme(theme: 'light' | 'dark') {
      await page.evaluate(t => {
        if (t === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }, theme);
      await page.waitForTimeout(300);
    }

    for (const route of routes) {
      const url = route.startsWith('http') ? route : `${baseUrl}${route}`;
      await page.goto(url);
      await page.waitForLoadState('networkidle');

      // Always test BOTH themes for every page
      console.log(`Auditing ${route} in Light Mode...`);
      await setTheme('light');
      await auditPage(page, 'light', route);

      console.log(`Auditing ${route} in Dark Mode...`);
      await setTheme('dark');
      await auditPage(page, 'dark', route);
    }

    console.log('AUDIT_RESULTS_START');
    console.log(JSON.stringify(issues, null, 2));
    console.log('AUDIT_RESULTS_END');

    // Fail test if any major issues found
    const majorIssues = issues.filter(i => i.severity === 'major');
    if (majorIssues.length > 0) {
      console.error(`Found ${majorIssues.length} major contrast violations:`);
      majorIssues.forEach(i => {
        console.error(
          `  [${i.theme}] ${i.page} - "${i.textOrIcon}" (${i.contrastRatio})`
        );
      });
    }
    expect(
      majorIssues.length,
      `Found ${majorIssues.length} major contrast violations`
    ).toBe(0);
  });

  test('Check authenticated pages contrast (requires auth)', async ({
    page,
  }) => {
    test.setTimeout(180000);

    // Try to sign in - skip test if auth fails
    try {
      await signInUser(page);
    } catch {
      test.skip(true, 'Auth not available, skipping authenticated page audit');
      return;
    }

    const authRoutes = [
      '/app/dashboard',
      '/app/settings',
      '/app/dashboard/links',
      '/account',
    ];

    async function setTheme(theme: 'light' | 'dark') {
      await page.evaluate(t => {
        if (t === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }, theme);
      await page.waitForTimeout(300);
    }

    for (const route of authRoutes) {
      const url = route.startsWith('http') ? route : `${baseUrl}${route}`;
      await page.goto(url);
      await page.waitForLoadState('networkidle');

      // Check if we got redirected to signin (auth failed)
      if (page.url().includes('/signin')) {
        console.warn(`Skipping ${route} - redirected to signin`);
        continue;
      }

      console.log(`Auditing ${route} in Light Mode...`);
      await setTheme('light');
      await auditPage(page, 'light', route);

      console.log(`Auditing ${route} in Dark Mode...`);
      await setTheme('dark');
      await auditPage(page, 'dark', route);
    }

    console.log('AUTH_AUDIT_RESULTS_START');
    console.log(JSON.stringify(issues, null, 2));
    console.log('AUTH_AUDIT_RESULTS_END');

    const majorIssues = issues.filter(i => i.severity === 'major');
    expect(
      majorIssues.length,
      `Found ${majorIssues.length} major contrast violations in auth pages`
    ).toBe(0);
  });
});
