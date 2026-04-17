import type { Page } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';
import { expect, test } from './setup';
import { smokeNavigateWithRetry } from './utils/smoke-test-utils';

const USE_TEST_AUTH_BYPASS = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';

test.use({ storageState: { cookies: [], origins: [] } });

async function visitAuthenticatedRoute(page: Page, route: string) {
  await setTestAuthBypassSession(page, 'creator-ready');
  await smokeNavigateWithRetry(page, route, {
    timeout: 120_000,
    retries: 2,
  });
  await page.waitForLoadState('domcontentloaded');
}

function normalizeTexts(values: string[]) {
  return values.map(value => value.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

async function collectAudienceContentSurface(page: Page) {
  const audienceTable = page
    .locator('table, [role="grid"], [data-testid="unified-table"]')
    .first();
  const emptyState = page.getByTestId('dashboard-audience-empty-state');

  return Promise.any([
    audienceTable
      .waitFor({ state: 'visible', timeout: 60_000 })
      .then(() => 'table' as const),
    emptyState
      .waitFor({ state: 'visible', timeout: 60_000 })
      .then(() => 'empty' as const),
  ]);
}

async function collectReleasesShape(
  page: Page,
  route: string,
  authenticated: boolean
) {
  if (authenticated) {
    await visitAuthenticatedRoute(page, route);
  } else {
    await smokeNavigateWithRetry(page, route, {
      timeout: 120_000,
      retries: 2,
    });
  }

  const matrix = page.getByTestId('releases-matrix');
  await expect(matrix).toBeVisible({ timeout: 60_000 });

  const previewToggle = page.getByRole('button', {
    name: 'Toggle release preview',
  });
  await expect(previewToggle).toBeVisible({ timeout: 30_000 });
  await previewToggle.click();

  const drawer = page.getByTestId('release-sidebar');
  await expect(drawer).toBeVisible({ timeout: 30_000 });

  return {
    toolbarButtons: {
      display: await page
        .getByRole('button', { name: 'Display' })
        .first()
        .isVisible(),
      preview: await page
        .getByRole('button', { name: 'Toggle release preview' })
        .first()
        .isVisible(),
    },
    matrixTabs: normalizeTexts(await matrix.getByRole('tab').allInnerTexts()),
    drawerTabs: normalizeTexts(await drawer.getByRole('tab').allInnerTexts()),
    drawerCards: {
      analytics: await drawer
        .getByTestId('release-smart-link-analytics')
        .isVisible(),
      metadata: await drawer.getByTestId('release-metadata-card').isVisible(),
    },
  };
}

async function collectAudienceShape(
  page: Page,
  route: string,
  authenticated: boolean
) {
  if (authenticated) {
    await visitAuthenticatedRoute(page, route);
  } else {
    await smokeNavigateWithRetry(page, route, {
      timeout: 120_000,
      retries: 2,
    });
  }

  const contentSurface = await collectAudienceContentSurface(page);

  const toggleAnalytics = page.getByRole('button', {
    name: /analytics panel/i,
  });
  await expect(toggleAnalytics).toBeVisible({ timeout: 30_000 });

  await expect(page.getByText('Audience funnel')).toBeVisible({
    timeout: 30_000,
  });

  return {
    hasToggleAnalytics: await toggleAnalytics.isVisible(),
    funnelVisible: await page.getByText('Audience funnel').isVisible(),
    audienceTabs: normalizeTexts(
      await page
        .getByRole('tab')
        .filter({ hasText: /Cities|Countries|Sources|Links/ })
        .allInnerTexts()
    ),
    toolbarButtons: {
      all: await page.getByRole('button', { name: 'All' }).isVisible(),
      identified: await page
        .getByRole('button', { name: 'Identified' })
        .isVisible(),
      anonymous: await page
        .getByRole('button', { name: 'Anonymous' })
        .isVisible(),
      filter: await page.getByRole('button', { name: 'Filter' }).isVisible(),
      export: await page
        .getByRole('button', { name: 'Export data to CSV file' })
        .isVisible(),
    },
    contentSurface,
    columnHeaders:
      contentSurface === 'table'
        ? normalizeTexts(await page.getByRole('columnheader').allInnerTexts())
        : [],
    emptyStateHeading:
      contentSurface === 'empty'
        ? await page
            .getByTestId('dashboard-audience-empty-state')
            .getByRole('heading')
            .innerText()
        : null,
  };
}

async function collectUnauthenticatedShape<T>(
  page: Page,
  collect: (demoPage: Page) => Promise<T>
) {
  const browser = page.context().browser();
  expect(
    browser,
    'Expected browser instance for demo parity capture'
  ).toBeTruthy();

  const demoContext = await browser!.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const demoPage = await demoContext.newPage();

  try {
    return await collect(demoPage);
  } finally {
    await demoContext.close();
  }
}

test.describe
  .serial('Demo/live route parity', () => {
    test.skip(!USE_TEST_AUTH_BYPASS, 'Requires E2E_USE_TEST_AUTH_BYPASS=1');

    test('releases demo mirrors the live releases workspace structure', async ({
      page,
    }) => {
      const liveShape = await collectReleasesShape(
        page,
        APP_ROUTES.DASHBOARD_RELEASES,
        true
      );
      const demoShape = await collectUnauthenticatedShape(page, demoPage =>
        collectReleasesShape(demoPage, '/demo', false)
      );

      expect(demoShape).toEqual(liveShape);
    });

    test('audience demo mirrors the live audience workspace structure', async ({
      page,
    }) => {
      const liveShape = await collectAudienceShape(
        page,
        APP_ROUTES.DASHBOARD_AUDIENCE,
        true
      );
      const demoShape = await collectUnauthenticatedShape(page, demoPage =>
        collectAudienceShape(demoPage, '/demo/audience', false)
      );

      expect(demoShape.hasToggleAnalytics).toBe(liveShape.hasToggleAnalytics);
      expect(demoShape.funnelVisible).toBe(liveShape.funnelVisible);
      expect(demoShape.audienceTabs).toEqual(liveShape.audienceTabs);
      expect(demoShape.toolbarButtons).toEqual(liveShape.toolbarButtons);
      expect(demoShape.contentSurface).toBe(liveShape.contentSurface);

      if (
        demoShape.contentSurface === 'table' &&
        liveShape.contentSurface === 'table'
      ) {
        expect(demoShape.columnHeaders).toEqual(liveShape.columnHeaders);
      }

      if (
        demoShape.contentSurface === 'empty' &&
        liveShape.contentSurface === 'empty'
      ) {
        expect(demoShape.emptyStateHeading).toBe(liveShape.emptyStateHeading);
      }
    });
  });
