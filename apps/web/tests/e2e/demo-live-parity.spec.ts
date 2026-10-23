import type { Page } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { setTestAuthBypassSession } from '../helpers/auth';
import { expect, test } from './setup';
import {
  isDestroyedExecutionContext,
  smokeNavigateWithRetry,
} from './utils/smoke-test-utils';

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

const AUDIENCE_COLUMN_HEADERS = [
  'Fan',
  'State',
  'Alerts',
  'Engagement',
  'Last Seen',
  'Action',
] as const;

async function classifyAudienceSurface(
  page: Page
): Promise<'table' | 'empty' | 'pending'> {
  try {
    if ((await page.getByTestId('dashboard-audience-loading').count()) > 0) {
      return 'pending';
    }

    const headers = normalizeTexts(
      await page.getByRole('columnheader').allInnerTexts()
    );
    if (AUDIENCE_COLUMN_HEADERS.every(header => headers.includes(header))) {
      return 'table';
    }

    const visibleEmptyStates = await page
      .locator('[data-testid="dashboard-audience-empty-state"]:visible')
      .count();
    return visibleEmptyStates > 0 ? 'empty' : 'pending';
  } catch (error) {
    // A navigation during the poll destroys the execution context. The poll
    // retries until the audience surface settles; the final not-pending
    // assertion is unchanged.
    if (isDestroyedExecutionContext(error)) return 'pending';
    throw error;
  }
}

async function collectAudienceContentSurface(page: Page) {
  let settled: 'table' | 'empty' = 'table';
  await expect
    .poll(
      async () => {
        const next = await classifyAudienceSurface(page);
        if (next !== 'pending') settled = next;
        return next;
      },
      { timeout: 60_000 }
    )
    .not.toBe('pending');
  return settled;
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
  // The funnel lives in the analytics panel, which starts closed.
  if ((await page.getByText('Audience funnel').count()) === 0) {
    await toggleAnalytics.click();
  }

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

    // JOV-8782: live /app/releases is the shell release list, /demo still
    // renders the table-era matrix. Re-enable when /demo moves to the shell.
    test.fixme('releases demo mirrors the live releases workspace structure', async ({
      page,
    }) => {
      const liveShape = await collectReleasesShape(
        page,
        APP_ROUTES.RELEASES,
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
        APP_ROUTES.AUDIENCE,
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
