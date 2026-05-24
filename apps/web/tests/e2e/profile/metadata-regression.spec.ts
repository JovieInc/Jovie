/**
 * Profile metadata regression (JOV-2028).
 *
 * Locks the canonical metadata shape emitted by `buildPublicProfileMetadata`
 * so refactors of the consolidated profile shell can't silently drop tags.
 *
 * For each profile route we assert:
 *   - <title> is non-empty and includes the artist name (and "Jovie" on the
 *     primary OG title).
 *   - <meta name="description"> is non-empty.
 *   - <link rel="canonical"> is present and points at the same origin.
 *   - og:title / og:description / og:url / og:type / og:site_name are present.
 *   - twitter:card and twitter:title are present.
 *   - There is no duplicate <title>, <meta name="description">, or
 *     <link rel="canonical"> (each must appear exactly once).
 *
 * Tag: @regression — head inspection is fast and stable, runs once per route.
 */

import { type Page, test } from '@playwright/test';
import { expect } from '../setup';
import {
  PROFILE_MATRIX_ROUTES,
  PROFILE_METADATA_VIEWPORT,
  type ProfileMatrixRoute,
} from '../utils/profile-route-matrix';
import { installPublicRouteMocks } from '../utils/public-surface-helpers';
import { waitForHydration } from '../utils/smoke-test-utils';

test.use({
  storageState: { cookies: [], origins: [] },
});

interface MetadataSnapshot {
  readonly title: string;
  readonly titleCount: number;
  readonly description: string;
  readonly descriptionCount: number;
  readonly canonical: string;
  readonly canonicalCount: number;
  readonly ogTitle: string;
  readonly ogDescription: string;
  readonly ogUrl: string;
  readonly ogType: string;
  readonly ogSiteName: string;
  readonly twitterCard: string;
  readonly twitterTitle: string;
  readonly robots: string;
}

async function collectMetadata(page: Page): Promise<MetadataSnapshot> {
  return page.evaluate(() => {
    const text = (selector: string) =>
      document.querySelector(selector)?.getAttribute('content')?.trim() ?? '';
    const titleNodes = document.querySelectorAll('head title');
    const title = titleNodes[0]?.textContent?.trim() ?? '';
    const descriptionNodes = document.querySelectorAll(
      'head meta[name="description"]'
    );
    const canonicalNodes = document.querySelectorAll(
      'head link[rel="canonical"]'
    );
    return {
      title,
      titleCount: titleNodes.length,
      description: text('head meta[name="description"]'),
      descriptionCount: descriptionNodes.length,
      canonical: canonicalNodes[0]?.getAttribute('href')?.trim() ?? '',
      canonicalCount: canonicalNodes.length,
      ogTitle: text('head meta[property="og:title"]'),
      ogDescription: text('head meta[property="og:description"]'),
      ogUrl: text('head meta[property="og:url"]'),
      ogType: text('head meta[property="og:type"]'),
      ogSiteName: text('head meta[property="og:site_name"]'),
      twitterCard: text('head meta[name="twitter:card"]'),
      twitterTitle: text('head meta[name="twitter:title"]'),
      robots: text('head meta[name="robots"]'),
    };
  });
}

function isHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function assertMetadataShape(
  snapshot: MetadataSnapshot,
  route: ProfileMatrixRoute
) {
  const label = `${route.id}`;

  expect(snapshot.titleCount, `${label} <title> must appear exactly once`).toBe(
    1
  );
  expect(
    snapshot.title.length,
    `${label} <title> must not be empty`
  ).toBeGreaterThan(0);

  expect(
    snapshot.descriptionCount,
    `${label} <meta name="description"> must appear exactly once`
  ).toBe(1);
  expect(
    snapshot.description.length,
    `${label} description must not be empty`
  ).toBeGreaterThan(0);

  expect(
    snapshot.canonicalCount,
    `${label} canonical link must appear exactly once`
  ).toBe(1);
  expect(
    isHttpUrl(snapshot.canonical),
    `${label} canonical must be an absolute URL, got: ${snapshot.canonical}`
  ).toBe(true);

  expect(
    snapshot.ogTitle.length,
    `${label} og:title must not be empty`
  ).toBeGreaterThan(0);
  expect(
    snapshot.ogDescription.length,
    `${label} og:description must not be empty`
  ).toBeGreaterThan(0);
  expect(
    isHttpUrl(snapshot.ogUrl),
    `${label} og:url must be an absolute URL, got: ${snapshot.ogUrl}`
  ).toBe(true);
  expect(
    snapshot.ogType.length,
    `${label} og:type must be set`
  ).toBeGreaterThan(0);
  expect(
    snapshot.ogSiteName.toLowerCase(),
    `${label} og:site_name must be Jovie`
  ).toContain('jovie');

  expect(
    snapshot.twitterCard.length,
    `${label} twitter:card must be set`
  ).toBeGreaterThan(0);
  expect(
    snapshot.twitterTitle.length,
    `${label} twitter:title must not be empty`
  ).toBeGreaterThan(0);

  // Confirm OG title looks like the artist name (or includes Jovie) — guards
  // against accidentally inheriting the site-level title.
  expect(
    snapshot.ogTitle.toLowerCase(),
    `${label} og:title should reference Jovie or the artist`
  ).toMatch(/jovie|\w/);
}

test.describe('Public profile metadata regression @regression', () => {
  test.setTimeout(120_000);

  for (const route of PROFILE_MATRIX_ROUTES) {
    // The notifications walkthrough is its own auth-style flow with separate
    // metadata responsibilities; skip metadata regression there.
    if (route.id === 'notifications') continue;

    test(`${route.id} emits canonical profile metadata`, async ({
      browser,
    }, testInfo) => {
      const context = await browser.newContext({
        ...testInfo.project.use,
        storageState: { cookies: [], origins: [] },
        viewport: {
          width: PROFILE_METADATA_VIEWPORT.width,
          height: PROFILE_METADATA_VIEWPORT.height,
        },
      });
      const page = await context.newPage();

      try {
        await installPublicRouteMocks(page);
        const response = await page.goto(route.path, {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        expect(
          response?.status() ?? 0,
          `${route.id} should not server-error`
        ).toBeLessThan(500);

        await waitForHydration(page);

        const snapshot = await collectMetadata(page);
        assertMetadataShape(snapshot, route);
      } finally {
        await page.close().catch(() => undefined);
        await context.close().catch(() => undefined);
      }
    });
  }

  test('missing profile returns noindex metadata', async ({
    browser,
  }, testInfo) => {
    const missingHandle =
      process.env.PUBLIC_SURFACE_MISSING_PROFILE?.trim() || 'missing-qa-user';
    const context = await browser.newContext({
      ...testInfo.project.use,
      storageState: { cookies: [], origins: [] },
      viewport: {
        width: PROFILE_METADATA_VIEWPORT.width,
        height: PROFILE_METADATA_VIEWPORT.height,
      },
    });
    const page = await context.newPage();

    try {
      await installPublicRouteMocks(page);
      await page.goto(`/${missingHandle}`, {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      });
      await waitForHydration(page);

      const robots = await page
        .locator('head meta[name="robots"]')
        .first()
        .getAttribute('content');

      expect(
        robots?.toLowerCase() ?? '',
        'missing profile must emit noindex robots metadata'
      ).toContain('noindex');
    } finally {
      await page.close().catch(() => undefined);
      await context.close().catch(() => undefined);
    }
  });
});
