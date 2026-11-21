import { expect, test } from '@playwright/test';
import { unknownProjection } from '@/lib/ovie/shipping-state';
import {
  ensureSignedInUser,
  getAdminCredentials,
  hasAdminCredentials,
  setTestAuthBypassSession,
} from '../helpers/auth';
import {
  ADMIN_MOBILE_SNAPSHOT_SURFACES,
  ADMIN_RENDER_SURFACES,
  type AdminSurfaceDescriptor,
  getAdminDesktopSnapshotName,
  getAdminSurfaceSelector,
} from './utils/admin-surface-manifest';
import { expectCaptureReady } from './utils/visual-capture-ready';

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

  // Ovie Home leads with the revenue blocker read from the cached company
  // snapshot. CI has no snapshot, so the real route answers 503 and Home shows
  // "Revenue state unavailable"; pin one fixed blocker instead.
  await page.route('**/api/ovie/home/blocker', route =>
    route.fulfill(
      jsonResponse({
        blocker: {
          schema: 'jovie.company-blocker/v1',
          id: 'funnel:paid',
          kind: 'funnel',
          step: 'paid',
          tone: 'warn',
          text: 'No artist has paid yet.',
          detailsHref: '/app/admin/product',
          since: null,
          nextAction: null,
          observedAt: '2099-01-01T12:00:00.000Z',
        },
        generatedAt: '2099-01-01T12:00:00.000Z',
      })
    )
  );

  // Shipping and Ops read the delivery projection the fleet host publishes.
  // CI has no fleet host, so the card reads "Disconnected" with source gaps.
  // Answer one fresh, connected projection, stamped when the page asks so its
  // relative times stay small and stable.
  await page.route('**/api/hud/shipping-state**', route =>
    route.fulfill(jsonResponse(freshShippingProjection()))
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

/** The section a deep link expanded, scrolled into view for the snapshot. */
async function openedAccordion(
  page: import('@playwright/test').Page,
  title: string
) {
  const toggle = page.getByRole('button', { name: title, exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true', {
    timeout: 30_000,
  });
  const section = toggle.locator('xpath=..');
  await section.scrollIntoViewIfNeeded();
  return section;
}

const measured = (value: number) =>
  value === 0
    ? { state: 'measured-zero', value: 0 }
    : { state: 'measured-nonzero', value };

/**
 * A connected `ovie.shipping-state.v1` read. Starts from the contract's own
 * empty projection, so every source the strict parser needs is present, then
 * marks it fresh with fixed delivery numbers.
 */
function freshShippingProjection() {
  const now = Date.now();
  const at = (offsetMs: number) => new Date(now - offsetMs).toISOString();
  const base = unknownProjection({
    sequence: 4,
    observationTimestamp: at(0),
    emissionTimestamp: at(0),
    latencyMs: 12,
    publishing: true,
    lastError: null,
  });
  const sources = Object.fromEntries(
    Object.entries(base.sources).map(([id, source]) => [
      id,
      { ...source, state: 'fresh' },
    ])
  );
  return {
    ...base,
    sourceRevision: 'rev-4',
    freshnessDeadline: new Date(now + 3_600_000).toISOString(),
    state: 'fresh',
    sources,
    delivery: {
      lanes: {
        running: measured(7),
        slots: measured(9),
        idle: measured(2),
        pool: measured(186),
        lastLandingAgeSeconds: measured(85),
        diskFreePct: 28.4,
        lanes: [
          { name: 'codex', running: 4, slots: 4 },
          { name: 'claude', running: 3, slots: 3 },
          { name: 'cursor', running: 0, slots: 2 },
        ],
        alerts: [],
        heldByReason: {},
        failedByReason: {},
        publishedAt: at(60_000),
        stale: false,
      },
      merges: {
        since: at(86_400_000),
        today: measured(42),
        byRepo: { Jovie: measured(36), 'summer-config': measured(6) },
        last7Days: measured(280),
        prior7Days: measured(225),
      },
      mergeQueueDepth: measured(2),
      inFlight: measured(0),
      certifiedHead: {
        sha: 'c3e74e00a9d234b8f6a1b2c3d4e5f60718293a4b',
        certifiedAt: at(1_800_000),
      },
      production: {
        sha: 'ee7401f37e0b324e225751f0d97ce229838ac8b4',
        version: '26.11.5',
        deployedAt: at(3_600_000),
        behindMain: measured(4),
      },
      staging: {
        sha: 'a1b2c3d4e5f60718293a4bc3e74e00a9d234b8f6',
        version: '26.11.6',
        deployedAt: at(1_200_000),
        behindMain: measured(1),
      },
      summer: { availability: 'up' },
    },
    meanings: {
      merged: { state: 'measured', value: false },
      queued: { state: 'measured', value: true },
      ciGreen: { state: 'measured', value: true },
      productionVerified: { state: 'measured', value: true },
      exactLiveBuild: { state: 'measured', value: true },
    },
  };
}

/**
 * Help copy that names an error word without being an error. Keep each
 * pattern to the one sentence it allows.
 */
const CAPTURE_ALLOWED_COPY: Readonly<Record<string, readonly RegExp[]>> = {
  'share-studio': [/when native file\s+share is unavailable/i],
};

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
      const root = await openSurface(page, surface, DESKTOP_VIEWPORT);
      const locator = surface.snapshotAccordion
        ? await openedAccordion(page, surface.snapshotAccordion)
        : root;

      await expectCaptureReady(locator, {
        allowCopy: CAPTURE_ALLOWED_COPY[surface.id],
      });
      await expect(locator).toHaveScreenshot(
        getAdminDesktopSnapshotName(surface)
      );
    });
  }

  for (const surface of ADMIN_MOBILE_SNAPSHOT_SURFACES) {
    test(`${surface.name} mobile`, async ({ page }) => {
      const locator = await openSurface(page, surface, MOBILE_VIEWPORT);

      await expectCaptureReady(locator, {
        allowCopy: CAPTURE_ALLOWED_COPY[surface.id],
      });
      await expect(locator).toHaveScreenshot(
        `${surface.snapshotSlug}-mobile.png`
      );
    });
  }
});
