import { expect, test } from '@playwright/test';
import { waitForHydration } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

const KEY_PAGES = [
  { path: '/', label: 'Homepage' },
  { path: '/pricing', label: 'Pricing' },
  { path: '/launch', label: 'Launch' },
  { path: '/artists', label: 'Artists' },
] as const;

const VIEWPORTS = [
  { width: 390, height: 844, label: 'mobile' },
  { width: 1440, height: 900, label: 'desktop' },
] as const;

type LayoutIssue = {
  a: string;
  b: string;
  overlapPx: number;
};

async function blockAnalytics(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
}

for (const viewport of VIEWPORTS) {
  test.describe(`layout guard (${viewport.label})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const pageUnderTest of KEY_PAGES) {
      test(`${pageUnderTest.label} has no major overlapping content`, async ({
        page,
      }) => {
        await blockAnalytics(page);
        await page.goto(pageUnderTest.path, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
        await waitForHydration(page, { timeout: 30_000 });
        await page
          .waitForLoadState('networkidle', { timeout: 5_000 })
          .catch(() => {});

        const issues = await page.evaluate(() => {
          const isVisible = (element: Element): element is HTMLElement => {
            if (!(element instanceof HTMLElement)) return false;
            const styles = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            const hasSize = rect.width > 12 && rect.height > 12;
            const isShown =
              styles.display !== 'none' &&
              styles.visibility !== 'hidden' &&
              styles.opacity !== '0' &&
              !element.hasAttribute('hidden') &&
              element.getAttribute('aria-hidden') !== 'true';

            return hasSize && isShown;
          };

          const isCandidate = (element: HTMLElement): boolean => {
            if (
              element.closest(
                'dialog,[role="dialog"],[role="tooltip"],[data-sonner-toaster]'
              )
            ) {
              return false;
            }

            const styles = window.getComputedStyle(element);
            if (['absolute', 'fixed', 'sticky'].includes(styles.position)) {
              return false;
            }

            let ancestor = element.parentElement;
            while (ancestor) {
              const ancestorPosition =
                window.getComputedStyle(ancestor).position;
              if (
                ancestorPosition === 'fixed' ||
                ancestorPosition === 'sticky'
              ) {
                return false;
              }
              ancestor = ancestor.parentElement;
            }

            return element.matches(
              'h1, h2, h3, h4, h5, h6, p, li, label, blockquote, pre, code, button, a[href], input, select, textarea, [role="button"], [role="link"], section, article, form, nav, aside'
            );
          };

          const describe = (element: HTMLElement): string => {
            const tag = element.tagName.toLowerCase();
            const id = element.id ? `#${element.id}` : '';
            const className =
              element.className
                .toString()
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map(name => `.${name}`)
                .join('') || '';
            const text = (element.textContent || '')
              .trim()
              .replace(/\s+/g, ' ')
              .slice(0, 30);

            return `${tag}${id}${className}${text ? ` [${text}]` : ''}`;
          };

          const intersect = (
            a0: number,
            a1: number,
            b0: number,
            b1: number
          ): number => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

          const elements = Array.from(
            document.querySelectorAll(
              'main *:not(script):not(style), header *:not(script):not(style), footer *:not(script):not(style)'
            )
          )
            .filter(isVisible)
            .filter(isCandidate)
            .slice(0, 140) as HTMLElement[];

          const issues: LayoutIssue[] = [];

          for (let i = 0; i < elements.length; i += 1) {
            for (let j = i + 1; j < elements.length; j += 1) {
              const first = elements[i];
              const second = elements[j];

              if (first.contains(second) || second.contains(first)) continue;

              const sharedParent = first.parentElement;
              if (
                sharedParent &&
                sharedParent === second.parentElement &&
                ['flex', 'grid', 'inline-flex', 'inline-grid'].includes(
                  window.getComputedStyle(sharedParent).display
                )
              ) {
                continue;
              }

              const firstRect = first.getBoundingClientRect();
              const secondRect = second.getBoundingClientRect();
              const overlapWidth = intersect(
                firstRect.left,
                firstRect.right,
                secondRect.left,
                secondRect.right
              );
              const overlapHeight = intersect(
                firstRect.top,
                firstRect.bottom,
                secondRect.top,
                secondRect.bottom
              );
              const overlapArea = overlapWidth * overlapHeight;

              if (overlapArea > 6) {
                issues.push({
                  a: describe(first),
                  b: describe(second),
                  overlapPx: Math.round(overlapArea),
                });
              }
            }
          }

          return issues.slice(0, 20);
        });

        expect(
          issues,
          `Found overlapping content on ${pageUnderTest.path} (${viewport.label}):\n${JSON.stringify(issues, null, 2)}`
        ).toEqual([]);
      });
    }
  });
}
