import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './setup';
import {
  assertPublicSurfaceHealthy,
  installPublicRouteMocks,
  runDeclaredPublicInteractions,
  waitForPublicSurfaceReady,
} from './utils/public-surface-helpers';
import {
  getLighthousePublicSurfaceManifestSync,
  resolvePublicSurfaceManifestSync,
} from './utils/public-surface-manifest';

test.use({ storageState: { cookies: [], origins: [] } });

function createEmptyStorageState() {
  return { cookies: [], origins: [] } as const;
}

function shouldSkipBlockingAxe(surface: {
  expectedState: 'ok' | 'redirect' | 'not-found';
  allowedFinalDocumentStatuses?: readonly number[];
  allowMissingMain?: boolean;
}) {
  return (
    surface.expectedState === 'redirect' &&
    surface.allowMissingMain === true &&
    surface.allowedFinalDocumentStatuses?.includes(404) === true
  );
}

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
        const input = element as HTMLInputElement;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const isVisible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          element.getAttribute('aria-hidden') !== 'true' &&
          rect.width > 0 &&
          rect.height > 0;

        if (!isVisible) {
          return null;
        }

        const labelledByText =
          element
            .getAttribute('aria-labelledby')
            ?.split(/\s+/)
            .map(id => document.getElementById(id)?.textContent?.trim() ?? '')
            .join(' ') ?? '';

        const label =
          element.getAttribute('aria-label') ||
          labelledByText ||
          element.getAttribute('title') ||
          ((input.type === 'button' ||
            input.type === 'submit' ||
            input.type === 'reset') &&
          typeof input.value === 'string'
            ? input.value
            : '') ||
          element.querySelector('img[alt]')?.getAttribute('alt') ||
          element.textContent ||
          input.labels?.[0]?.textContent ||
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

const surfaceFilter = getSurfaceFilter();
function loadSurfaceManifests() {
  try {
    return {
      lighthouseSurfaces: getLighthousePublicSurfaceManifestSync().filter(
        surface => (surfaceFilter ? surfaceFilter.has(surface.id) : true)
      ),
      publicSurfaces: resolvePublicSurfaceManifestSync().filter(surface =>
        surfaceFilter ? surfaceFilter.has(surface.id) : true
      ),
      error: null,
    } as const;
  } catch (error) {
    return {
      lighthouseSurfaces: [],
      publicSurfaces: [],
      error: new Error(
        `Failed to resolve public surface manifests for axe audit: ${
          error instanceof Error ? error.message : String(error)
        }`
      ),
    } as const;
  }
}

const {
  publicSurfaces,
  lighthouseSurfaces,
  error: surfaceManifestLoadError,
} = loadSurfaceManifests();

test.describe('Axe WCAG 2.1 Compliance', () => {
  test.setTimeout(120_000);

  test('public surface manifests load successfully', () => {
    if (surfaceManifestLoadError) {
      throw surfaceManifestLoadError;
    }
  });

  for (const surface of publicSurfaces) {
    test(`${surface.id} passes WCAG AA`, async ({ browser }, testInfo) => {
      const surfaceContext = await browser.newContext({
        ...testInfo.project.use,
        storageState: createEmptyStorageState(),
      });
      const page = await surfaceContext.newPage();
      await installPublicRouteMocks(page);

      try {
        await page.goto(surface.resolvedPath, {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        await waitForPublicSurfaceReady(page, surface);
        await assertPublicSurfaceHealthy(page, surface);

        if (shouldSkipBlockingAxe(surface)) {
          return;
        }

        await runDeclaredPublicInteractions(
          page,
          surface,
          testInfo.project.name
        );
        if (page.isClosed()) {
          return;
        }
        await assertInteractiveLabels(page, surface.id);

        if (
          surface.expectedState !== 'redirect' &&
          surface.allowMultipleH1 !== true
        ) {
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
      } finally {
        await page.close().catch(() => undefined);
        await surfaceContext.close().catch(() => undefined);
      }
    });
  }

  for (const surface of lighthouseSurfaces) {
    test(`${surface.id} best-practice scan stays informational`, async ({
      browser,
    }, testInfo) => {
      const surfaceContext = await browser.newContext({
        ...testInfo.project.use,
        storageState: createEmptyStorageState(),
      });
      const page = await surfaceContext.newPage();
      await installPublicRouteMocks(page);

      try {
        await page.goto(surface.resolvedPath, {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        await waitForPublicSurfaceReady(page, surface);

        if (shouldSkipBlockingAxe(surface)) {
          return;
        }

        await runDeclaredPublicInteractions(
          page,
          surface,
          testInfo.project.name
        );
        if (page.isClosed()) {
          return;
        }

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
      } finally {
        await page.close().catch(() => undefined);
        await surfaceContext.close().catch(() => undefined);
      }
    });
  }
});
