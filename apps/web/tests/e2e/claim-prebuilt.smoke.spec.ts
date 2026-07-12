import { neon } from '@neondatabase/serverless';
import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  E2E_PREBUILT_CLAIM_SPOTIFY_ID,
  E2E_PREBUILT_CLAIM_TOKEN,
  E2E_PREBUILT_CLAIM_USERNAME,
} from '@/lib/testing/e2e-prebuilt-claim';
import {
  SMOKE_TIMEOUTS,
  smokeNavigateWithRetry,
  waitForHydration,
} from './utils/smoke-test-utils';

/**
 * GTM canary: prebuilt profile claim link → claim banner → auth front door.
 *
 * Acceptance (JOV-1880):
 * - Seed artist is prebuilt (public, unclaimed, claimable, has fan/release data)
 * - Claim token link works
 * - CTA routes into the onboarding auth funnel with the reserved handle
 *
 * Full claim ownership mutation + first publish remain covered by golden-path
 * / onboarding robot lanes. This smoke is the deploy-gated claim-link canary.
 *
 * @smoke @critical
 */

test.use({ storageState: { cookies: [], origins: [] } });

const hasDatabase = Boolean(
  process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('dummy')
);

async function assertPrebuiltClaimFixture(): Promise<boolean> {
  if (!hasDatabase) return false;

  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql<
    Array<{
      is_claimed: boolean | null;
      user_id: string | null;
      claim_token: string | null;
      spotify_id: string | null;
      release_count: number | string | null;
    }>
  >`
    select
      cp.is_claimed,
      cp.user_id,
      cp.claim_token,
      cp.spotify_id,
      (
        select count(*)::int
        from discog_releases dr
        where dr.creator_profile_id = cp.id
      ) as release_count
    from creator_profiles cp
    where cp.username_normalized = ${E2E_PREBUILT_CLAIM_USERNAME}
    limit 1
  `;

  const profile = rows[0];
  if (!profile) return false;
  if (profile.is_claimed || profile.user_id) return false;
  if (!profile.claim_token) return false;
  if (profile.spotify_id !== E2E_PREBUILT_CLAIM_SPOTIFY_ID) return false;

  const releaseCount = Number(profile.release_count ?? 0);
  return releaseCount > 0;
}

test.describe('Prebuilt profile claim flow @smoke', () => {
  test('claim token link lands on prebuilt profile with claim banner and auth CTA', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    if (!hasDatabase) {
      test.skip(true, 'DATABASE_URL required for prebuilt claim fixture');
      return;
    }

    const fixtureReady = await assertPrebuiltClaimFixture();
    if (!fixtureReady) {
      test.skip(
        true,
        `Seed fixture missing for unclaimed ${E2E_PREBUILT_CLAIM_USERNAME} with claim token + releases`
      );
      return;
    }

    await page.route('**/api/profile/view', r =>
      r.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', r =>
      r.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', r =>
      r.fulfill({ status: 200, body: '{}' })
    );

    const claimPath = `/claim/${E2E_PREBUILT_CLAIM_TOKEN}`;
    const response = await smokeNavigateWithRetry(page, claimPath, {
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
      retries: 2,
    });

    expect(
      response?.status() ?? 0,
      'Claim token route should not 5xx'
    ).toBeLessThan(500);

    await expect(page).toHaveURL(
      new RegExp(`/${E2E_PREBUILT_CLAIM_USERNAME}(?:\\?|$)`),
      { timeout: SMOKE_TIMEOUTS.URL_STABLE }
    );
    expect(new URL(page.url()).searchParams.get('claim')).toBe('1');

    await waitForHydration(page);

    const claimBanner = page.getByTestId('claim-banner');
    await expect(claimBanner, 'Claim banner should render').toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    const claimCta = page.getByTestId('claim-banner-cta');
    await expect(claimCta, 'Claim CTA should render').toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    await claimCta.click();

    await expect(page).toHaveURL(
      new RegExp(`(${APP_ROUTES.SIGNUP}|${APP_ROUTES.START})`),
      { timeout: SMOKE_TIMEOUTS.URL_STABLE }
    );

    const finalUrl = new URL(page.url());
    expect(
      finalUrl.searchParams.get('handle')?.toLowerCase(),
      'Claim CTA must preserve the prebuilt handle into auth/onboarding'
    ).toBe(E2E_PREBUILT_CLAIM_USERNAME);

    await expect(
      page.locator('body'),
      'Auth front door should not render an application error'
    ).not.toContainText(/application error|internal server error/i);
  });
});
