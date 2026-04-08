import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './setup';
import {
  assertPublicSurfaceHealthy,
  installPublicRouteMocks,
  runDeclaredPublicInteractions,
  waitForPublicSurfaceReady,
} from './utils/public-surface-helpers';
import {
  getLighthousePublicSurfaceManifest,
  resolvePublicSurfaceManifest,
} from './utils/public-surface-manifest';

test.use({ storageState: { cookies: [], origins: [] } });

function getSurfaceFilter() {
  const raw = process.env.PUBLIC_SURFACE_FILTER?.trim();
  if (!raw) {
    return null;
  }

  return new Set(
    raw
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean)
  );
}

async function assertInteractiveLabels(
  page: import('@playwright/test').Page,
  surfaceId: string
) {
  const unlabeled = await page.locator('button, a, input').evaluateAll(nodes =>
    nodes
      .map(node => {
        const element = node as HTMLElement;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const isVisible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0;

        if (!isVisible) {
          return null;
        }

        const label =
          element.getAttribute('aria-label') ||
          element.textContent ||
          (element as HTMLInputElement).labels?.[0]?.textContent ||
          '';

        if (label.trim().length > 0) {
          return null;
        }

        return element.outerHTML.slice(0, 200);
      })
      .filter(Boolean)
      .slice(0, 5)
  );

  expect(
    unlabeled,
    `${surfaceId} rendered unlabeled visible interactive elements`
  ).toHaveLength(0);
}

test.describe('Axe WCAG 2.1 Compliance', () => {
  test.setTimeout(240_000);

  test.beforeEach(async ({ page }) => {
    await installPublicRouteMocks(page);
  });

  test('all public anonymous surfaces pass WCAG AA', async ({
    page,
  }, testInfo) => {
    const filter = getSurfaceFilter();
    const surfaces = (await resolvePublicSurfaceManifest()).filter(surface =>
      filter ? filter.has(surface.id) : true
    );

    for (const surface of surfaces) {
      await test.step(`${surface.id} ${surface.resolvedPath}`, async () => {
        await page.goto(surface.resolvedPath, {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        await waitForPublicSurfaceReady(page, surface);
        await assertPublicSurfaceHealthy(page, surface);
        await runDeclaredPublicInteractions(
          page,
          surface,
          testInfo.project.name
        );
        await assertInteractiveLabels(page, surface.id);

        if (surface.expectedState !== 'redirect') {
          const h1Count = await page.locator('h1').count();
          expect(h1Count, `${surface.id} should render exactly one h1`).toBe(1);
        }

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();

        expect(
          results.violations,
          `${surface.id} has accessibility violations`
        ).toEqual([]);
      });
    }
  });

  test('best-practice scan stays informational on launch lighthouse surfaces', async ({
    page,
  }, testInfo) => {
    const filter = getSurfaceFilter();
    const surfaces = (await getLighthousePublicSurfaceManifest()).filter(
      surface => (filter ? filter.has(surface.id) : true)
    );

    for (const surface of surfaces) {
      await test.step(`${surface.id} best-practice`, async () => {
        await page.goto(surface.resolvedPath, {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        await waitForPublicSurfaceReady(page, surface);
        await runDeclaredPublicInteractions(
          page,
          surface,
          testInfo.project.name
        );

        const results = await new AxeBuilder({ page })
          .withTags(['best-practice'])
          .analyze();

        if (results.violations.length > 0) {
          console.log(
            JSON.stringify(
              {
                surfaceId: surface.id,
                bestPracticeViolations: results.violations.map(violation => ({
                  id: violation.id,
                  impact: violation.impact,
                  help: violation.help,
                })),
              },
              null,
              2
            )
          );
        }
      });
    }
  });
});
