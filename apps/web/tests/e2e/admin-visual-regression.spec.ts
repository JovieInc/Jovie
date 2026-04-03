import { expect, test } from '@playwright/test';
import {
  ensureSignedInUser,
  getAdminCredentials,
  hasAdminCredentials,
  setTestAuthBypassSession,
} from '../helpers/clerk-auth';
import {
  ADMIN_MOBILE_SNAPSHOT_SURFACES,
  ADMIN_RENDER_SURFACES,
  type AdminSurfaceDescriptor,
  getAdminSurfaceSelector,
} from './utils/admin-surface-manifest';

const DESKTOP_VIEWPORT = { width: 1440, height: 1100 } as const;
const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const USE_TEST_AUTH_BYPASS = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';

function jsonResponse(body: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

async function blockPassiveTracking(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', route =>
    route.fulfill(jsonResponse({}))
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill(jsonResponse({}))
  );
  await page.route('**/api/track', route => route.fulfill(jsonResponse({})));
}

async function registerAdminVisualStubs(page: import('@playwright/test').Page) {
  await blockPassiveTracking(page);

  await page.route('**/api/admin/leads/settings', route =>
    route.fulfill(
      jsonResponse({
        settings: {
          enabled: true,
          discoveryEnabled: true,
          autoIngestEnabled: false,
          autoIngestMinFitScore: 70,
          autoIngestDailyLimit: 10,
          dailyQueryBudget: 100,
          dailySendCap: 12,
          maxPerHour: 6,
          rampMode: 'manual',
          guardrailsEnabled: true,
          guardrailThresholds: {
            minimumSampleSize: 30,
            increaseClaimClickRate: 0.06,
            holdClaimClickRateFloor: 0.03,
            pauseClaimClickRateFloor: 0.03,
            maxBounceComplaintRate: 0.03,
            maxUnsubscribeRate: 0.05,
            maxProviderFailureRate: 0.1,
          },
          queriesUsedToday: 7,
        },
      })
    )
  );

  await page.route('**/api/admin/leads/keywords', route =>
    route.fulfill(
      jsonResponse({
        keywords: [
          {
            id: 'e2e-admin-keyword-1',
            query: 'E2E Admin',
            enabled: true,
            resultsFoundTotal: 12,
            lastUsedAt: '2099-01-01T12:00:00.000Z',
          },
        ],
      })
    )
  );

  await page.route('**/api/admin/outreach/settings', route =>
    route.fulfill(jsonResponse({ campaignsEnabled: true }))
  );

  await page.route('**/api/admin/outreach?*', route => {
    const url = new URL(route.request().url());
    const queue = url.searchParams.get('queue') ?? 'all';

    if (queue === 'email') {
      const isCountRequest = url.searchParams.get('limit') === '1';
      return route.fulfill(
        jsonResponse(
          isCountRequest
            ? { items: [], total: 2 }
            : {
                items: [
                  {
                    id: 'e2e-email-1',
                    displayName: 'E2E Admin Email Lead',
                    contactEmail: 'e2e-admin-email-lead@jov.ie',
                    priorityScore: 91,
                    fitScore: 89,
                    outreachStatus: 'pending',
                    outreachQueuedAt: null,
                  },
                ],
                total: 2,
                pendingTotal: 2,
                page: 1,
                limit: 50,
              }
        )
      );
    }

    if (queue === 'dm') {
      return route.fulfill(
        jsonResponse({
          items: [
            {
              id: 'e2e-dm-1',
              displayName: 'E2E Admin DM Lead',
              instagramHandle: 'e2e_admin_dm',
              priorityScore: 84,
              dmCopy: 'E2E Admin DM copy',
              outreachStatus: 'pending',
            },
          ],
          total: 1,
        })
      );
    }

    if (queue === 'review' || queue === 'manual_review') {
      return route.fulfill(
        jsonResponse({
          items: [
            {
              id: 'e2e-review-1',
              displayName: 'E2E Admin Review Lead',
              contactEmail: 'e2e-admin-review@jov.ie',
              instagramHandle: 'e2e_admin_review',
              priorityScore: 72,
              fitScore: 64,
              outreachStatus: 'pending',
              signals: {
                emailSuspicious: true,
                hasRepresentation: true,
              },
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
        })
      );
    }

    return route.fulfill(
      jsonResponse({
        items: [],
        total: 4,
      })
    );
  });

  await page.route('**/api/admin/campaigns/settings', route =>
    route.fulfill(
      jsonResponse({
        ok: true,
        settings: {
          campaignsEnabled: true,
          fitScoreThreshold: 50,
          batchLimit: 20,
          throttlingConfig: {
            minDelayMs: 30000,
            maxDelayMs: 120000,
            maxPerHour: 30,
          },
          updatedAt: '2099-01-01T12:00:00.000Z',
          updatedBy: 'seed-admin-test-data',
        },
      })
    )
  );

  await page.route('**/api/admin/creator-invite/bulk/stats', route =>
    route.fulfill(
      jsonResponse({
        ok: true,
        campaign: {
          total: 24,
          pending: 3,
          sending: 1,
          sent: 16,
          failed: 1,
          claimed: 3,
        },
        jobQueue: {
          pending: 3,
          processing: 1,
          succeeded: 16,
          failed: 1,
          nextRunAt: '2099-01-01T12:30:00.000Z',
          estimatedMinutesRemaining: 12,
        },
        updatedAt: '2099-01-01T12:00:00.000Z',
      })
    )
  );

  await page.route('**/api/admin/creator-invite/bulk?*', route =>
    route.fulfill(
      jsonResponse({
        ok: true,
        threshold: 50,
        totalEligible: 12,
        sample: {
          withEmails: 9,
          withoutEmails: 3,
          profiles: [
            {
              id: 'campaign-profile-1',
              username: 'e2e-admin-one',
              displayName: 'E2E Admin Artist One',
              fitScore: 88,
              email: 'e2e-admin-artist-1@jov.ie',
            },
          ],
        },
      })
    )
  );

  await page.route('**/api/admin/campaigns/stats', route =>
    route.fulfill(
      jsonResponse({
        ok: true,
        range: '30d',
        invites: {
          total: 24,
          pending: 3,
          scheduled: 2,
          sending: 1,
          sent: 16,
          bounced: 1,
          failed: 1,
          unsubscribed: 0,
        },
        engagement: {
          totalOpens: 48,
          uniqueOpens: 18,
          totalClicks: 16,
          uniqueClicks: 11,
          openRate: 75,
          clickRate: 45.8,
          clickToOpenRate: 61.1,
        },
        conversion: {
          profilesClaimed: 3,
          claimRate: 12.5,
        },
        updatedAt: '2099-01-01T12:00:00.000Z',
      })
    )
  );

  await page.route('**/api/admin/campaigns/invites?*', route =>
    route.fulfill(
      jsonResponse({
        ok: true,
        invites: [
          {
            id: 'campaign-invite-1',
            email: 'e2e-admin-artist-1@jov.ie',
            status: 'sent',
            createdAt: '2099-01-01T12:00:00.000Z',
            sentAt: '2099-01-01T12:05:00.000Z',
            profile: {
              id: 'campaign-profile-1',
              username: 'e2e-admin-one',
              displayName: 'E2E Admin Artist One',
              avatarUrl: null,
              fitScore: 88,
              isClaimed: true,
            },
            engagement: {
              opened: true,
              openedAt: '2099-01-01T12:07:00.000Z',
              clicked: true,
              clickedAt: '2099-01-01T12:08:00.000Z',
              clickCount: 2,
            },
          },
        ],
        pagination: {
          total: 1,
          limit: 10,
          offset: 0,
          hasMore: false,
        },
      })
    )
  );

  await page.route('**/api/admin/investors/links', route =>
    route.fulfill(
      jsonResponse({
        links: [
          {
            id: 'investor-link-1',
            token: 'e2e-admin-investor-link',
            label: 'E2E Admin Investor Link',
            investorName: 'E2E Admin Capital',
            email: 'e2e-admin-investor@jov.ie',
            stage: 'engaged',
            engagementScore: 61,
            notes: 'Seeded admin fixture',
            isActive: true,
            createdAt: '2099-01-01T12:00:00.000Z',
            updatedAt: '2099-01-01T12:00:00.000Z',
          },
        ],
      })
    )
  );

  await page.route('**/api/admin/investors/settings', route =>
    route.fulfill(
      jsonResponse({
        settings: {
          showProgressBar: true,
          raiseTarget: 500000,
          committedAmount: 175000,
          investorCount: 12,
          bookCallUrl: 'https://cal.com/e2e-admin/fundraise',
          investUrl: 'https://jov.ie/invest/e2e-admin',
          slackWebhookUrl: null,
          followupEnabled: true,
          followupDelayHours: 48,
          engagedThreshold: 50,
          updatedAt: '2099-01-01T12:00:00.000Z',
        },
      })
    )
  );
}

async function openSurface(
  page: import('@playwright/test').Page,
  surface: AdminSurfaceDescriptor,
  viewport: { width: number; height: number }
) {
  await page.setViewportSize(viewport);
  await page.goto(surface.path, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  const locator = page.locator(getAdminSurfaceSelector(surface)).first();
  await expect(locator).toBeVisible({ timeout: 30_000 });
  return locator;
}

test.describe('admin visual regression', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasAdminCredentials(), 'Admin auth not available');

    await registerAdminVisualStubs(page);

    if (USE_TEST_AUTH_BYPASS) {
      await setTestAuthBypassSession(page, 'admin');
      return;
    }

    await ensureSignedInUser(page, getAdminCredentials());
  });

  for (const surface of ADMIN_RENDER_SURFACES) {
    test(`${surface.name} desktop`, async ({ page }) => {
      const locator = await openSurface(page, surface, DESKTOP_VIEWPORT);

      await expect(locator).toHaveScreenshot(
        `${surface.snapshotSlug}-desktop.png`
      );
    });
  }

  for (const surface of ADMIN_MOBILE_SNAPSHOT_SURFACES) {
    test(`${surface.name} mobile`, async ({ page }) => {
      const locator = await openSurface(page, surface, MOBILE_VIEWPORT);

      await expect(locator).toHaveScreenshot(
        `${surface.snapshotSlug}-mobile.png`
      );
    });
  }
});
