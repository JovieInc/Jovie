import { expect, test } from '@playwright/test';
import { waitForHydration } from './utils/smoke-test-utils';

/**
 * Layout Overlap Guard
 *
 * Blocks regressions where visible content overlaps or touches unexpectedly.
 * Runs on a small matrix of key public pages, viewports, and themes.
 */

test.use({ storageState: { cookies: [], origins: [] } });

const KEY_PAGES = [
  { path: '/', label: 'Homepage' },
  { path: '/pricing', label: 'Pricing' },
  { path: '/launch', label: 'Launch' },
  { path: '/artists', label: 'Artists' },
] as const;

const VIEWPORTS = [
  { width: 390, height: 844, label: 'mobile' },
  { width: 768, height: 1024, label: 'tablet' },
  { width: 1440, height: 900, label: 'desktop' },
] as const;

const THEMES = ['light', 'dark'] as const;

type LayoutIssue = {
  kind: 'overlap';
  a: string;
  b: string;
  overlapPx: number;
};

for (const viewport of VIEWPORTS) {
  test.describe(`layout guard @blocking (${viewport.label})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const theme of THEMES) {
      for (const pageUnderTest of KEY_PAGES) {
        test(`${pageUnderTest.label} has no overlapping/touching content in ${theme}`, async ({
          page,
        }) => {
          await page.route('**/api/profile/view', r =>
            r.fulfill({ status: 200, body: '{}' })
          );
          await page.route('**/api/audience/visit', r =>
            r.fulfill({ status: 200, body: '{}' })
          );
          await page.route('**/api/track', r =>
            r.fulfill({ status: 200, body: '{}' })
          );
          await page.goto(pageUnderTest.path, {
            waitUntil: 'domcontentloaded',
          });
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

          await page.evaluate(selectedTheme => {
            document.documentElement.classList.remove('light', 'dark');
            document.documentElement.classList.add(selectedTheme);
            document.documentElement.setAttribute('data-theme', selectedTheme);
            window.localStorage.setItem('theme', selectedTheme);
          }, theme);

          await waitForHydration(page);

          const issues = await page.evaluate(() => {
            const isVisible = (el: Element): el is HTMLElement => {
              if (!(el instanceof HTMLElement)) return false;
              const styles = window.getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              const hasSize = rect.width > 12 && rect.height > 12;
              const shown =
                styles.display !== 'none' &&
                styles.visibility !== 'hidden' &&
                styles.opacity !== '0' &&
                !el.hasAttribute('hidden') &&
                !el.getAttribute('aria-hidden');
              return hasSize && shown;
            };

            const isCandidate = (el: HTMLElement): boolean => {
              if (
                el.closest(
                  'dialog,[role="dialog"],[role="tooltip"],[data-sonner-toaster]'
                )
              ) {
                return false;
              }

              const styles = window.getComputedStyle(el);
              if (['absolute', 'fixed', 'sticky'].includes(styles.position)) {
                return false;
              }

              // Also skip descendants of fixed/sticky containers (e.g. floating bars)
              let ancestor = el.parentElement;
              while (ancestor) {
                const pos = window.getComputedStyle(ancestor).position;
                if (pos === 'fixed' || pos === 'sticky') return false;
                ancestor = ancestor.parentElement;
              }

              const interactive = el.matches(
                'button, a[href], input, select, textarea, [role="button"], [role="link"]'
              );

              const textual = el.matches(
                'h1, h2, h3, h4, h5, h6, p, li, label, blockquote, pre, code'
              );

              const landmark = el.matches('section, article, form, nav, aside');

              return interactive || textual || landmark;
            };

            const selector =
              'main *:not(script):not(style), header *:not(script):not(style), footer *:not(script):not(style)';
            const elements = Array.from(document.querySelectorAll(selector))
              .filter(isVisible)
              .filter(isCandidate)
              .slice(0, 140) as HTMLElement[];

            const describe = (el: HTMLElement): string => {
              const tag = el.tagName.toLowerCase();
              const id = el.id ? `#${el.id}` : '';
              const classes =
                (el.className || '')
                  .toString()
                  .trim()
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map(cls => `.${cls}`)
                  .join('') || '';
              const text = (el.textContent || '')
                .trim()
                .replace(/\s+/g, ' ')
                .slice(0, 30);
              return `${tag}${id}${classes}${text ? ` [${text}]` : ''}`;
            };

            const intersects1D = (
              a0: number,
              a1: number,
              b0: number,
              b1: number
            ): number => {
              return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
            };

            const issues: LayoutIssue[] = [];

            for (let i = 0; i < elements.length; i++) {
              for (let j = i + 1; j < elements.length; j++) {
                const a = elements[i];
                const b = elements[j];

                if (a.contains(b) || b.contains(a)) continue;

                const parent = a.parentElement;
                if (parent && parent === b.parentElement) {
                  const parentDisplay = window.getComputedStyle(parent).display;
                  if (
                    parentDisplay.includes('flex') ||
                    parentDisplay.includes('grid')
                  ) {
                    continue;
                  }
                }

                const ar = a.getBoundingClientRect();
                const br = b.getBoundingClientRect();

                const xOverlap = intersects1D(
                  ar.left,
                  ar.right,
                  br.left,
                  br.right
                );
                const yOverlap = intersects1D(
                  ar.top,
                  ar.bottom,
                  br.top,
                  br.bottom
                );
                const overlapArea = xOverlap * yOverlap;

                // Significant visual overlap: ignore tiny anti-aliasing/subpixel effects.
                if (overlapArea > 6) {
                  issues.push({
                    kind: 'overlap',
                    a: describe(a),
                    b: describe(b),
                    overlapPx: Math.round(overlapArea),
                  });
                }

                // Note: "touching" detection (gapPx <= 0.6) was removed because
                // adjacent block-level elements (sections, navs) naturally touch
                // in normal document flow and flagging them produces false positives.
              }
            }

            return issues.slice(0, 20);
          });

          expect(
            issues,
            `Found overlapping/touching content on ${pageUnderTest.path} (${viewport.label}, ${theme}):\n${JSON.stringify(issues, null, 2)}`
          ).toEqual([]);
        });
      }
    }
  });
}
