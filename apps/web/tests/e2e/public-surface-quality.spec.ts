/**
 * Public-surface quality suite (profiles + release pages).
 *
 * Runs every PUBLIC_SURFACE_TEMPLATES route at 390px mobile and feeds the
 * collected page data (rects, meta, axe, text) to the pure checks in
 * lib/quality/public-surface-checks.ts.
 *
 *   PR lane   : local seeded server (default BASE_URL).
 *   Prod canary: BASE_URL=https://jov.ie  (read-only GETs only).
 *               Seeded handles do not exist on prod, so set
 *               PUBLIC_SURFACE_QUALITY_PROD_PROFILE (default "tim") and
 *               PUBLIC_SURFACE_QUALITY_PROD_RELEASE ("<handle>/<slug>").
 *
 * Throttled-mobile LCP / JS weight / request count are NOT measured here;
 * they go through the Lighthouse gate (scripts/public-surface-perf-gate.ts).
 * CLS is collected here via a buffered layout-shift observer.
 *
 * Findings -> test mapping: docs/golden-path/public-surface-quality.md
 *
 * @public-surface-quality
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { wcag22AaAxeOptions } from '@/lib/a11y-gates/wcag-standard.cjs';
import {
  checkCookieCardFold,
  checkOgImageContentType,
  checkServiceDial,
  checkSocialMeta,
  evaluatePerfBudget,
  extractContactRoleLines,
  findBadAltText,
  findBlockingAxeViolations,
  findDirectDspLinkAboveFold,
  findDuplicateContactRoles,
  findPlaceholderText,
  findTapTargetViolations,
  findTextOverCoverArt,
  formatViolations,
  type PerfBudgets,
  PUBLIC_SURFACE_TEMPLATES,
  type PublicSurfaceTemplate,
  type Rect,
  type Violation,
} from '@/lib/quality/public-surface-checks';
import baseline from '../../public-surface-quality.baseline.json';
import { expect, test } from './setup';

const VIEWPORT = { width: 390, height: 844 } as const;
const baseURL = process.env.BASE_URL?.trim() || 'http://localhost:3100';
const isProdCanary = /^https:\/\/(www\.)?jov\.ie/i.test(baseURL);
const budgets = baseline.perf as PerfBudgets;

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: VIEWPORT,
});

interface ResolvedRoute {
  readonly template: PublicSurfaceTemplate;
  readonly path: string;
}

function resolveRoutes(): { run: ResolvedRoute[]; skipped: string[] } {
  const run: ResolvedRoute[] = [];
  const skipped: string[] = [];
  const prodProfile =
    process.env.PUBLIC_SURFACE_QUALITY_PROD_PROFILE?.trim() || 'tim';
  const prodRelease = process.env.PUBLIC_SURFACE_QUALITY_PROD_RELEASE?.trim();
  for (const template of PUBLIC_SURFACE_TEMPLATES) {
    if (template.fixture === 'pending') {
      skipped.push(`${template.id}: pendingFixtures (see baseline JSON)`);
      continue;
    }
    if (isProdCanary) {
      if (template.id === 'profile-many-release') {
        run.push({ template, path: `/${prodProfile}` });
      } else if (template.id === 'release-2plus-services' && prodRelease) {
        run.push({ template, path: `/${prodRelease}` });
      } else {
        skipped.push(`${template.id}: no stable prod fixture`);
      }
      continue;
    }
    run.push({
      template,
      path:
        template.kind === 'release'
          ? `/${template.handle}/${template.releaseSlug}`
          : `/${template.handle}`,
    });
  }
  return { run, skipped };
}

const { run: routes, skipped } = resolveRoutes();

async function gotoReady(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
  expect(response?.status(), `${path} HTTP status`).toBeLessThan(400);
  await page.locator('main, h1').first().waitFor({ state: 'visible' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

async function collectCls(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>(resolve => {
        let total = 0;
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
            };
            if (!shift.hadRecentInput) total += shift.value;
          }
        });
        try {
          observer.observe({ type: 'layout-shift', buffered: true });
        } catch {
          resolve(0);
          return;
        }
        setTimeout(() => {
          observer.disconnect();
          resolve(total);
        }, 1000);
      })
  );
}

interface PageData {
  interactive: Array<{ description: string; rect: Rect; visible: boolean }>;
  textBoxes: Array<{ text: string; rect: Rect }>;
  coverArt: Array<{ rect: Rect; alt: string | null; src: string }>;
  anchors: Array<{ href: string; rect: Rect; visible: boolean }>;
  meta: Record<string, string>;
  canonical: string | undefined;
  dialPresent: boolean;
  cookieRect: Rect | null;
}

async function collectPageData(page: Page): Promise<PageData> {
  return page.evaluate(() => {
    const toRect = (r: DOMRect) => ({
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
    });
    const isVisible = (el: Element) => {
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        Number(style.opacity) > 0 &&
        r.width > 0 &&
        r.height > 0
      );
    };
    const selector =
      'a[href], button, [role="button"], [role="tab"], [role="link"], [role="menuitem"], input:not([type="hidden"]), select, summary';
    const interactive = [...document.querySelectorAll(selector)]
      .filter(el => !el.closest('[aria-hidden="true"]'))
      .map(el => ({
        description: `${el.tagName.toLowerCase()}${
          el.getAttribute('data-testid')
            ? `[data-testid=${el.getAttribute('data-testid')}]`
            : ''
        } "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"`,
        rect: toRect(el.getBoundingClientRect()),
        visible: isVisible(el),
      }));

    const textBoxes: PageData['textBoxes'] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const parent = node.parentElement;
      if (!text || !parent || !isVisible(parent)) continue;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (r.width > 1 && r.height > 1)
        textBoxes.push({ text, rect: toRect(r) });
    }

    // Cover art: any visible image at least 120px square.
    const coverArt = [...document.images]
      .filter(img => isVisible(img))
      .map(img => ({ img, r: img.getBoundingClientRect() }))
      .filter(({ r }) => r.width >= 120 && r.height >= 120)
      .map(({ img, r }) => ({
        rect: toRect(r),
        alt: img.getAttribute('alt'),
        src: img.currentSrc || img.src,
      }));

    const anchors = [...document.querySelectorAll('a[href]')].map(a => ({
      href: (a as HTMLAnchorElement).href,
      rect: toRect(a.getBoundingClientRect()),
      visible: isVisible(a),
    }));

    const meta: Record<string, string> = {};
    for (const m of document.querySelectorAll('meta[property], meta[name]')) {
      const key = m.getAttribute('property') || m.getAttribute('name');
      const content = m.getAttribute('content');
      if (key && content) meta[key] = content;
    }
    const banner = document.querySelector('[data-testid="cookie-banner"]');

    return {
      interactive,
      textBoxes,
      coverArt,
      anchors,
      meta,
      canonical:
        document.querySelector('link[rel="canonical"]')?.getAttribute('href') ??
        undefined,
      dialPresent:
        document.querySelector('[data-testid="action-dial"]') !== null,
      cookieRect:
        banner && isVisible(banner)
          ? toRect(banner.getBoundingClientRect())
          : null,
    };
  });
}

function expectNoViolations(violations: readonly Violation[]) {
  expect(violations, formatViolations(violations)).toEqual([]);
}

test.describe('public surface quality @public-surface-quality', () => {
  test.describe.configure({ mode: 'parallel' });

  test('every non-pending template has a route (matrix not silently empty)', () => {
    expect(routes.length, `skipped: ${skipped.join('; ')}`).toBeGreaterThan(0);
  });

  for (const { template, path } of routes) {
    test.describe(`${template.id} ${path}`, () => {
      test('layout, content and metadata invariants', async ({ page }) => {
        await gotoReady(page, path);
        const data = await collectPageData(page);
        const label = `${template.id} ${path}`;
        const violations: Violation[] = [];

        // 2. tap targets
        violations.push(...findTapTargetViolations(data.interactive));

        // 4. placeholders (visible text)
        const bodyText = data.textBoxes.map(t => t.text).join('\n');
        violations.push(...findPlaceholderText(bodyText, 'general', label));

        // 5. text over cover art
        violations.push(
          ...findTextOverCoverArt(
            data.textBoxes,
            data.coverArt.map(a => a.rect),
            label
          )
        );

        // 6. dial (release pages)
        if (template.kind === 'release') {
          violations.push(
            ...checkServiceDial({
              serviceCount: template.expectedServices ?? 0,
              dialPresent: data.dialPresent,
              label,
            })
          );
          // Finding 1: direct DSP link above the fold (no extra tap).
          if ((template.expectedServices ?? 0) > 0) {
            violations.push(
              ...findDirectDspLinkAboveFold(
                data.anchors,
                VIEWPORT.height,
                label
              )
            );
          }
        }

        // 7. meta + alt text
        violations.push(...checkSocialMeta(data.meta, data.canonical, label));
        violations.push(...findBadAltText(data.coverArt, label));

        // Finding 2: cookie card in the first fold
        violations.push(
          ...checkCookieCardFold(data.cookieRect, VIEWPORT.height, 0.2, label)
        );

        // 1. CLS budget
        violations.push(
          ...evaluatePerfBudget({ cls: await collectCls(page) }, budgets, label)
        );

        expectNoViolations(violations);
      });

      test('og:image resolves to an image', async ({ page, request }) => {
        await gotoReady(page, path);
        const ogImage = await page
          .locator('meta[property="og:image"]')
          .first()
          .getAttribute('content');
        expect(ogImage, 'og:image present').toBeTruthy();
        const response = await request.get(
          new URL(ogImage ?? '', baseURL).toString()
        );
        expectNoViolations(
          checkOgImageContentType(
            response.headers()['content-type'],
            response.status(),
            template.id
          )
        );
      });

      test('axe: zero serious/critical violations', async ({ page }) => {
        await gotoReady(page, path);
        const results = await new AxeBuilder({ page })
          .options(wcag22AaAxeOptions)
          .analyze();
        expectNoViolations(findBlockingAxeViolations(results.violations));
      });
    });
  }

  // 4. contact placeholders / duplicate roles on About and Contact tabs.
  for (const { template } of routes.filter(
    r => r.template.kind === 'profile'
  )) {
    for (const mode of ['about', 'contact'] as const) {
      test(`${template.id}: ${mode} tab has no placeholder or duplicate contact roles`, async ({
        page,
      }) => {
        const handle = isProdCanary
          ? process.env.PUBLIC_SURFACE_QUALITY_PROD_PROFILE?.trim() || 'tim'
          : template.handle;
        await gotoReady(page, `/${handle}?mode=${mode}`);
        const text = await page.locator('main').first().innerText();
        const label = `${template.id}?mode=${mode}`;
        expectNoViolations([
          ...findPlaceholderText(text, 'contact', label),
          ...findDuplicateContactRoles(extractContactRoleLines(text), label),
        ]);
      });
    }
  }
});
