/**
 * Shared E2E test helpers extracted from golden-path.spec.ts.
 *
 * Used by both golden-path and yc-demo specs. All functions use
 * direct Neon HTTP queries (not the pool) to avoid SSR abort races.
 */

import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { neon } from '@neondatabase/serverless';
import { expect, type Page } from '@playwright/test';
import { ensureClerkTestUser } from '@/lib/testing/test-user-provision.server';
import {
  smokeNavigateWithRetry,
  waitForHydration,
} from '@/tests/e2e/utils/smoke-test-utils';
import {
  setTestAuthBypassSession,
  waitForAuthenticatedHealth,
} from '@/tests/helpers/clerk-auth';

/* ------------------------------------------------------------------ */
/*  Environment gates                                                   */
/* ------------------------------------------------------------------ */

export const REQUIRED_ENV = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
} as const;

export function hasRealEnv(): boolean {
  return Object.values(REQUIRED_ENV).every(
    v => v && !v.includes('mock') && !v.includes('dummy')
  );
}

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface EnsuredUserRow {
  id: string;
}

export interface SpotifyImportStateRow {
  id: string;
  spotify_url: string | null;
  spotify_id: string | null;
  is_public: boolean | null;
  avatar_url: string | null;
  onboarding_completed_at: string | null;
  spotify_import_status: string | null;
  release_count: number | null;
  spotify_release_link_count: number | null;
}

export interface MultiDspEnrichmentState {
  profile_id: string;
  apple_music_id: string | null;
  apple_music_url: string | null;
  deezer_id: string | null;
  tidal_id: string | null;
  soundcloud_id: string | null;
  youtube_music_id: string | null;
  youtube_url: string | null;
  social_link_count: number | null;
}

export interface DemoReleaseLookup {
  id: string;
  slug: string;
  title: string | null;
  releaseDate?: string | null;
}

interface OnboardingDiscoveryReadiness {
  blockingReason:
    | 'missing_spotify_selection'
    | 'spotify_import_in_progress'
    | 'spotify_import_failed'
    | 'discovery_in_progress'
    | 'awaiting_first_release'
    | null;
  canProceedToDashboard: boolean;
  phase: 'connecting' | 'importing' | 'discovering' | 'ready' | 'failed';
}

interface OnboardingDiscoverySnapshot {
  profile: {
    id: string;
  };
  readiness?: OnboardingDiscoveryReadiness;
}

/** Spotify IDs for known major artists with guaranteed multi-DSP coverage */
export const MAJOR_ARTIST_IDS = new Set([
  '6M2wZ9GZgrQXHCFfjv46we', // Dua Lipa
  '06HL4z0CvFAxyc27GXpf02', // Taylor Swift
]);

export const DEFAULT_ONBOARDING_SPOTIFY_ARTIST = {
  id: '6M2wZ9GZgrQXHCFfjv46we',
  url: 'https://open.spotify.com/artist/6M2wZ9GZgrQXHCFfjv46we',
} as const;

/* ------------------------------------------------------------------ */
/*  Spotify import helpers                                              */
/* ------------------------------------------------------------------ */

export function spotifyImportIsReady(
  state: SpotifyImportStateRow | null | undefined
): boolean {
  if (!state) {
    return false;
  }

  const releaseCount = Number(state.release_count ?? 0);
  const releaseLinkCount = Number(state.spotify_release_link_count ?? 0);
  const hasSpotifyProfile =
    Boolean(state.spotify_id) && Boolean(state.spotify_url);

  return (
    state.spotify_import_status === 'complete' &&
    hasSpotifyProfile &&
    releaseCount > 0 &&
    releaseLinkCount > 0
  );
}

export function onboardingProfileIsReady(
  state: SpotifyImportStateRow | null | undefined
): boolean {
  if (!state) {
    return false;
  }

  return Boolean(
    state.spotify_id &&
      state.spotify_url &&
      state.is_public &&
      state.onboarding_completed_at
  );
}

export function countPopulatedDspFields(
  state: MultiDspEnrichmentState
): number {
  let count = 0;
  if (state.apple_music_id || state.apple_music_url) count++;
  if (state.deezer_id) count++;
  if (state.tidal_id) count++;
  if (state.soundcloud_id) count++;
  if (state.youtube_music_id || state.youtube_url) count++;
  return count;
}

export async function waitForSpotifyImport(clerkUserId: string) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL required for Spotify import checks');
  }

  const sql = neon(dbUrl);

  const [state] = (await sql`
    SELECT
      cp.id,
      cp.spotify_url,
      cp.spotify_id,
      cp.is_public,
      cp.avatar_url,
      cp.onboarding_completed_at,
      cp.settings->>'spotifyImportStatus' AS spotify_import_status,
      (
        SELECT COUNT(*)
        FROM discog_releases dr
        WHERE dr.creator_profile_id = cp.id
      )::int AS release_count,
      (
        SELECT COUNT(*)
        FROM provider_links pl
        INNER JOIN discog_releases dr ON dr.id = pl.release_id
        WHERE dr.creator_profile_id = cp.id
          AND pl.provider_id = 'spotify'
          AND pl.owner_type = 'release'
      )::int AS spotify_release_link_count
    FROM creator_profiles cp
    INNER JOIN users u ON u.id = cp.user_id
    WHERE u.clerk_id = ${clerkUserId}
    LIMIT 1
  `) as SpotifyImportStateRow[];

  return state ?? null;
}

export async function waitForMultiDspEnrichment(clerkUserId: string) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL required for multi-DSP enrichment checks');
  }

  const sql = neon(dbUrl);

  const [state] = (await sql`
    SELECT
      cp.id AS profile_id,
      cp.apple_music_id,
      cp.apple_music_url,
      cp.deezer_id,
      cp.tidal_id,
      cp.soundcloud_id,
      cp.youtube_music_id,
      cp.youtube_url,
      (
        SELECT COUNT(*)
        FROM social_links sl
        WHERE sl.creator_profile_id = cp.id
          AND sl.state = 'active'
      )::int AS social_link_count
    FROM creator_profiles cp
    INNER JOIN users u ON u.id = cp.user_id
    WHERE u.clerk_id = ${clerkUserId}
    LIMIT 1
  `) as MultiDspEnrichmentState[];

  return state ?? null;
}

export async function advanceOnboardingAfterArtistSelection(
  page: Page,
  timeoutMs = 120_000
): Promise<'checkout' | 'dashboard' | 'importing' | 'review'> {
  const deadline = Date.now() + timeoutMs;
  const reviewDisplayName = page.locator('#onboarding-display-name');
  const reviewGoToDashboard = page.getByRole('button', {
    name: /go to dashboard/i,
  });
  const actionButtons = [
    page.getByRole('button', { name: /^Continue$/i }),
    page.getByRole('button', { name: /^Continue free$/i }),
    page.getByRole('button', { name: /^Finish setup$/i }),
    page.getByRole('button', { name: /^Open dashboard$/i }),
  ];

  while (Date.now() < deadline) {
    if (/\/app(?:\/|$|\?)/.test(page.url())) {
      return 'dashboard';
    }

    if (/\/onboarding\/checkout(?:\/|$|\?)/.test(page.url())) {
      return 'checkout';
    }

    if (
      (await reviewDisplayName.isVisible().catch(() => false)) ||
      (await reviewGoToDashboard.isVisible().catch(() => false))
    ) {
      return 'review';
    }

    let clicked = false;
    for (const button of actionButtons) {
      const candidate = button.first();
      if (
        (await candidate.isVisible().catch(() => false)) &&
        (await candidate.isEnabled().catch(() => false))
      ) {
        try {
          await candidate.click({ timeout: 3_000 });
          clicked = true;
          break;
        } catch {
          continue;
        }
      }
    }

    await page.waitForTimeout(clicked ? 500 : 1_000);
  }

  if (
    page.url().includes('/onboarding') &&
    page.url().includes('resume=spotify')
  ) {
    return 'importing';
  }

  throw new Error(
    `Onboarding did not reach review or dashboard after artist selection. Current URL: ${page.url()}`
  );
}

export async function advanceOnboardingToArtistSelection(
  page: Page,
  timeoutMs = 60_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const artistInput = page.getByPlaceholder(/search.*artist.*spotify/i);
  const continueButton = page.getByRole('button', { name: /^Continue$/i });

  while (Date.now() < deadline) {
    if (await artistInput.isVisible().catch(() => false)) {
      return;
    }

    const candidate = continueButton.first();
    if (
      (await candidate.isVisible().catch(() => false)) &&
      (await candidate.isEnabled().catch(() => false))
    ) {
      try {
        await candidate.click({ timeout: 3_000 });
      } catch {
        // Ignore transient re-render races and keep polling.
      }
    }

    await page.waitForTimeout(1_000);
  }

  throw new Error(
    `Onboarding did not reach artist selection. Current URL: ${page.url()}`
  );
}

export async function getFirstReleaseForUser(
  clerkUserId: string
): Promise<DemoReleaseLookup | null> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL required for release lookup');
  }

  const sql = neon(dbUrl);

  const [preferredRelease] = (await sql`
    SELECT
      dr.id,
      dr.slug,
      dr.title
    FROM discog_releases dr
    INNER JOIN creator_profiles cp ON cp.id = dr.creator_profile_id
    INNER JOIN users u ON u.id = cp.user_id
    WHERE u.clerk_id = ${clerkUserId}
      AND (dr.release_date IS NULL OR dr.release_date <= NOW())
      AND EXISTS (
        SELECT 1
        FROM provider_links pl
        WHERE pl.release_id = dr.id
          AND pl.owner_type = 'release'
      )
    ORDER BY COALESCE(dr.release_date, dr.created_at) DESC, dr.created_at DESC
    LIMIT 1
  `) as DemoReleaseLookup[];

  if (preferredRelease) {
    return preferredRelease;
  }

  const [fallbackRelease] = (await sql`
    SELECT
      dr.id,
      dr.slug,
      dr.title
    FROM discog_releases dr
    INNER JOIN creator_profiles cp ON cp.id = dr.creator_profile_id
    INNER JOIN users u ON u.id = cp.user_id
    WHERE u.clerk_id = ${clerkUserId}
    ORDER BY COALESCE(dr.release_date, dr.created_at) DESC, dr.created_at DESC
    LIMIT 1
  `) as DemoReleaseLookup[];

  return fallbackRelease ?? null;
}

export async function getTopDemoReleasesForUser(
  clerkUserId: string,
  limit = 3
): Promise<DemoReleaseLookup[]> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL required for release lookup');
  }

  const sql = neon(dbUrl);
  const rows = (await sql`
    SELECT
      dr.id,
      dr.slug,
      dr.title,
      dr.release_date::text AS "releaseDate"
    FROM discog_releases dr
    INNER JOIN creator_profiles cp ON cp.id = dr.creator_profile_id
    INNER JOIN users u ON u.id = cp.user_id
    WHERE u.clerk_id = ${clerkUserId}
    ORDER BY COALESCE(dr.release_date, dr.created_at) DESC, dr.created_at DESC
  `) as DemoReleaseLookup[];

  const deduped: DemoReleaseLookup[] = [];
  const seenTitles = new Set<string>();

  for (const row of rows) {
    const title = row.title?.trim();
    if (!title || seenTitles.has(title)) {
      continue;
    }
    seenTitles.add(title);
    deduped.push(row);
    if (deduped.length >= limit) {
      break;
    }
  }

  return deduped;
}

export async function getDemoUserHandle(
  clerkUserId: string
): Promise<string | null> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL required for demo handle lookup');
  }

  const sql = neon(dbUrl);

  const [row] = (await sql`
    SELECT cp.username
    FROM creator_profiles cp
    INNER JOIN users u ON u.id = cp.user_id
    WHERE u.clerk_id = ${clerkUserId}
    LIMIT 1
  `) as Array<{ username: string | null }>;

  return row?.username ?? null;
}

/* ------------------------------------------------------------------ */
/*  Handle generation                                                   */
/* ------------------------------------------------------------------ */

export function buildValidOnboardingHandle(
  seed: string,
  clerkUserId: string
): string {
  const seedFragment = seed.replaceAll(/[^a-z0-9]/g, '').slice(0, 12);
  const userFragment = clerkUserId.replaceAll(/[^a-z0-9]/gi, '').toLowerCase();
  return `j${seedFragment}${userFragment.slice(-6)}`.slice(0, 30);
}

export async function completeOnboardingV2(
  page: Page,
  spotifyArtistUrl: string = DEFAULT_ONBOARDING_SPOTIFY_ARTIST.url,
  options: Readonly<{ clerkUserId?: string; expectedHandle?: string }> = {}
) {
  if (options.clerkUserId) {
    await ensureServerAuthenticated(page, options.clerkUserId);
  }

  const onboardingWrapper = page.locator(
    '[data-testid="onboarding-form-wrapper"]'
  );
  const handleSubmitButton = onboardingWrapper
    .locator('button[type="submit"]')
    .first();
  const spotifyHeading = page.getByRole('heading', {
    name: 'Are you on Spotify?',
  });
  // Seeded handles arrive from the query string, and the V2 form immediately
  // revalidates them on mount. Waiting briefly avoids clicking during the
  // transient "checking" window, which otherwise leaves the step pending.
  await expect
    .poll(
      async () => {
        if (await spotifyHeading.isVisible().catch(() => false)) {
          return 'spotify';
        }

        if (await handleSubmitButton.isVisible().catch(() => false)) {
          return 'handle';
        }

        return 'waiting';
      },
      { timeout: 30_000 }
    )
    .toMatch(/handle|spotify/);

  await waitForHydration(page, { timeout: 90_000 });

  if (!(await spotifyHeading.isVisible().catch(() => false))) {
    const handleInput = page.getByLabel('Claim your handle');
    await expect(onboardingWrapper).toHaveAttribute('data-hydrated', 'true', {
      timeout: 90_000,
    });
    await expect
      .poll(
        async () => {
          if (await spotifyHeading.isVisible().catch(() => false)) {
            return 'spotify';
          }

          if (await handleInput.isVisible().catch(() => false)) {
            if (options.expectedHandle) {
              const currentValue = (await handleInput.inputValue()).trim();
              if (currentValue !== options.expectedHandle) {
                return `unexpected-handle:${currentValue || 'empty'}`;
              }
            }

            if (await handleSubmitButton.isEnabled().catch(() => false)) {
              return 'handle-ready';
            }

            if (await handleSubmitButton.isVisible().catch(() => false)) {
              return 'handle-loading';
            }
          }

          return 'waiting';
        },
        { timeout: 90_000 }
      )
      .toMatch(/spotify|handle-ready|handle-loading|unexpected-handle:.+/);

    if (!(await spotifyHeading.isVisible().catch(() => false))) {
      await expect(handleInput).toBeVisible({ timeout: 20_000 });
      if (options.expectedHandle) {
        await expect
          .poll(async () => (await handleInput.inputValue()).trim(), {
            timeout: 20_000,
          })
          .toBe(options.expectedHandle);
      }
      await expect(handleSubmitButton).toBeEnabled({ timeout: 20_000 });
      await handleSubmitButton.click();
    }
  }

  await expect(spotifyHeading).toBeVisible({ timeout: 60_000 });

  const artistInput = page.getByPlaceholder(
    'Search by artist name or paste a Spotify link'
  );
  await expect(artistInput).toBeVisible({ timeout: 20_000 });
  await artistInput.fill(spotifyArtistUrl);

  await expect(
    page.getByRole('heading', { name: 'Spotify is connected' })
  ).toBeVisible({ timeout: 60_000 });
  const upgradeHeading = page.getByRole('heading', {
    name: 'Want the full profile from day one?',
  });
  const lateArrivalsHeading = page.getByRole('heading', {
    name: 'A few more things showed up',
  });
  const artistConfirmContinue = page.getByRole('button', { name: 'Continue' });
  const lateArrivalsFinish = page.getByRole('button', { name: 'Finish setup' });
  const releasePreviewHeading = page.getByRole('heading', {
    name: 'Your release preview',
  });
  const releasePreviewContinue = page.getByRole('button', { name: 'Continue' });
  const profileReadyHeading = page.getByRole('heading', {
    name: /^(Your profile is ready|Your Link Is Live)$/i,
  });

  if (options.clerkUserId) {
    await waitForOnboardingReadiness(page, options.clerkUserId);
  }

  await expect
    .poll(
      async () => {
        if (!page.url().includes('/onboarding')) {
          return 'dashboard';
        }

        if (await profileReadyHeading.isVisible().catch(() => false)) {
          return 'profile-ready';
        }

        if (await upgradeHeading.isVisible().catch(() => false)) {
          return 'upgrade';
        }

        if (
          (await artistConfirmContinue.isVisible().catch(() => false)) &&
          (await artistConfirmContinue.isEnabled().catch(() => false))
        ) {
          return 'artist-confirm-ready';
        }

        return 'waiting';
      },
      { timeout: 180_000 }
    )
    .toMatch(/upgrade|artist-confirm-ready|profile-ready|dashboard/);

  if (
    (await artistConfirmContinue.isVisible().catch(() => false)) &&
    (await artistConfirmContinue.isEnabled().catch(() => false))
  ) {
    await artistConfirmContinue.click();
  }

  const postConfirmStep = await expect
    .poll(
      async () => {
        if (!page.url().includes('/onboarding')) {
          return 'dashboard';
        }

        if (await profileReadyHeading.isVisible().catch(() => false)) {
          return 'profile-ready';
        }

        if (await upgradeHeading.isVisible().catch(() => false)) {
          return 'upgrade';
        }

        if (await lateArrivalsHeading.isVisible().catch(() => false)) {
          return 'late-arrivals';
        }

        if (await releasePreviewHeading.isVisible().catch(() => false)) {
          return 'releases';
        }

        return 'waiting';
      },
      { timeout: 30_000 }
    )
    .toMatch(/profile-ready|upgrade|late-arrivals|releases|dashboard/)
    .then(async () =>
      !page.url().includes('/onboarding')
        ? 'dashboard'
        : (await profileReadyHeading.isVisible().catch(() => false))
          ? 'profile-ready'
          : (await lateArrivalsHeading.isVisible().catch(() => false))
            ? 'late-arrivals'
            : (await releasePreviewHeading.isVisible().catch(() => false))
              ? 'releases'
              : 'upgrade'
    );

  if (postConfirmStep === 'dashboard') {
    return;
  }

  if (postConfirmStep === 'upgrade') {
    await page.getByRole('button', { name: 'Continue free' }).click();
  }

  if (postConfirmStep === 'releases') {
    await releasePreviewContinue.click();
  }

  if (postConfirmStep === 'late-arrivals') {
    await lateArrivalsFinish.click();
  }

  await expect
    .poll(
      async () => {
        if (!page.url().includes('/onboarding')) {
          return 'dashboard';
        }

        if (await profileReadyHeading.isVisible().catch(() => false)) {
          return 'profile-ready';
        }

        if (
          (await releasePreviewHeading.isVisible().catch(() => false)) &&
          (await releasePreviewContinue.isVisible().catch(() => false)) &&
          (await releasePreviewContinue.isEnabled().catch(() => false))
        ) {
          await releasePreviewContinue.click();
          return 'releases';
        }

        if (
          (await lateArrivalsHeading.isVisible().catch(() => false)) &&
          (await lateArrivalsFinish.isVisible().catch(() => false)) &&
          (await lateArrivalsFinish.isEnabled().catch(() => false))
        ) {
          await lateArrivalsFinish.click();
          return 'late-arrivals';
        }

        return 'waiting';
      },
      { timeout: 120_000 }
    )
    .toMatch(/profile-ready|late-arrivals|releases|dashboard/);

  if (options.clerkUserId) {
    await expect
      .poll(
        async () => {
          const importState = await waitForSpotifyImport(options.clerkUserId!);
          return importState?.spotify_import_status ?? 'missing';
        },
        { timeout: 30_000 }
      )
      .not.toBe('importing');
  }

  await expect(profileReadyHeading).toBeVisible({ timeout: 120_000 });
  await expect(
    page.getByRole('button', { name: 'Open dashboard' })
  ).toBeEnabled({ timeout: 30_000 });
}

export async function ensureServerAuthenticated(
  page: Page,
  clerkUserId: string
): Promise<void> {
  const shouldAttachTestBypass =
    process.env.E2E_USE_TEST_AUTH_BYPASS === '1' ||
    process.env.E2E_ATTACH_TEST_AUTH_BYPASS_AFTER_SIGNUP === '1';

  if (!shouldAttachTestBypass) {
    return;
  }

  await setTestAuthBypassSession(page, null, clerkUserId);
  await waitForAuthenticatedHealth(page, clerkUserId);
}

async function fetchOnboardingDiscoverySnapshot(
  page: Page,
  profileId: string
): Promise<{
  snapshot: OnboardingDiscoverySnapshot | null;
  status: string;
}> {
  return page.evaluate(async id => {
    const response = await fetch(`/api/onboarding/discovery?profileId=${id}`, {
      cache: 'no-store',
      credentials: 'include',
    });

    if (!response.ok) {
      return {
        snapshot: null,
        status: `discovery-http-${response.status}`,
      };
    }

    const payload = (await response.json()) as {
      snapshot?: OnboardingDiscoverySnapshot;
      success?: boolean;
    };

    if (!payload.success || !payload.snapshot) {
      return {
        snapshot: null,
        status: 'discovery-empty',
      };
    }

    return {
      snapshot: payload.snapshot,
      status: 'ok',
    };
  }, profileId);
}

export async function waitForOnboardingReadiness(
  page: Page,
  clerkUserId: string
): Promise<string> {
  let profileId: string | null = null;

  await expect
    .poll(
      async () => {
        await ensureServerAuthenticated(page, clerkUserId);

        const importState = await waitForSpotifyImport(clerkUserId);
        profileId = importState?.id ?? null;

        if (!profileId) {
          return 'missing-profile';
        }

        if (importState?.spotify_import_status === 'importing') {
          return 'spotify_import_in_progress';
        }

        const discovery = await fetchOnboardingDiscoverySnapshot(
          page,
          profileId
        );
        if (discovery.status !== 'ok') {
          return discovery.status;
        }

        const snapshot = discovery.snapshot;
        if (!snapshot?.readiness) {
          return 'missing-readiness';
        }

        if (!snapshot.readiness.canProceedToDashboard) {
          return (
            snapshot.readiness.blockingReason ??
            snapshot.readiness.phase ??
            'waiting'
          );
        }

        return 'ready';
      },
      { timeout: 180_000 }
    )
    .toBe('ready');

  if (!profileId) {
    throw new Error('Onboarding readiness resolved without a profile ID');
  }

  return profileId;
}

/* ------------------------------------------------------------------ */
/*  Clerk user management                                               */
/* ------------------------------------------------------------------ */

/**
 * Delete all stale golden-path test users from Clerk to stay within the
 * 100-user dev-instance cap. Each test run creates a new
 * `gp-*+clerk_test@test.jovie.com` user; without cleanup the cap fills up.
 */
export async function purgeStaleClerkTestUsers() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey || secretKey.includes('mock')) return;

  try {
    const allUsers: Array<{
      id: string;
      email_addresses: Array<{ email_address: string }>;
    }> = [];

    for (let offset = 0; offset < 500; offset += 100) {
      const url = new URL('https://api.clerk.com/v1/users');
      url.searchParams.set('limit', '100');
      url.searchParams.set('offset', String(offset));
      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      if (!resp.ok) break;
      const page = (await resp.json()) as typeof allUsers;
      if (!Array.isArray(page) || page.length === 0) break;
      allUsers.push(...page);
      if (page.length < 100) break;
    }

    const toDelete = allUsers.filter(u =>
      u.email_addresses.some(
        e =>
          e.email_address.startsWith('gp-') &&
          e.email_address.endsWith('+clerk_test@test.jovie.com')
      )
    );

    if (toDelete.length > 0) {
      await Promise.all(
        toDelete.map(u =>
          fetch(`https://api.clerk.com/v1/users/${u.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${secretKey}` },
          }).catch(() => {})
        )
      );
      console.log(`[e2e] Purged ${toDelete.length} stale Clerk test user(s)`);
    }
  } catch {
    // Non-critical — if purge fails we'll still attempt to create
  }
}

/**
 * Clear onboarding rate limits from Upstash Redis.
 * Repeated test runs exhaust the "3 per hour per IP" limit.
 */
export async function clearOnboardingRateLimits() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;

  try {
    const collectKeys = async (pattern: string) => {
      const response = await fetch(`${url}/keys/${pattern}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as { result?: string[] };
      return payload.result ?? [];
    };

    const keys = [
      ...(await collectKeys('onboarding:ip:*')),
      ...(await collectKeys('onboarding:user:*')),
    ];

    if (keys.length === 0) return;

    await fetch(`${url}/del/${keys.join('/')}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Non-critical — if Redis is down, in-memory limiter resets per server restart
  }
}

async function clearCachedUserState(clerkUserId: string) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;

  try {
    await fetch(
      `${url}/del/${encodeURIComponent(`proxy:user-state:${clerkUserId}`)}/${encodeURIComponent(`admin:role:${clerkUserId}`)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
  } catch {
    // Non-critical — stale cache will self-heal, but local E2E may need a reload
  }
}

export interface SeedOnboardedCreatorProfileOptions {
  readonly clerkUserId: string;
  readonly handle: string;
  readonly displayName: string;
  readonly spotifyId: string;
  readonly spotifyUrl: string;
  readonly careerHighlights?: string | null;
}

interface SeededCreatorProfileRow {
  id: string;
}

/**
 * Pre-create a DB user row via direct Neon HTTP query.
 *
 * The onboarding page's server component creates users via the WebSocket
 * pool, but concurrent SSR renders in Next.js can abort the pool queries.
 * Pre-creating the user avoids this race condition.
 *
 * Also releases the test Spotify artist ID from any previous test profiles
 * to avoid unique constraint violations on repeated runs.
 *
 * @param knownSpotifyArtistIds - Additional Spotify IDs to release from
 *   previous test profiles (beyond the standard test user email match).
 */
export async function ensureDbUser(
  clerkUserId: string,
  email: string,
  knownSpotifyArtistIds: string[] = []
) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required for DB user creation');

  const sql = neon(dbUrl);
  await clearOnboardingRateLimits();

  // Release ALL test-linked Spotify artist IDs from previous test profiles.
  await sql`
    UPDATE creator_profiles
    SET spotify_id = NULL, spotify_url = NULL
    WHERE user_id IN (
      SELECT id FROM users WHERE email LIKE '%+clerk_test@test.jovie.com'
    ) AND spotify_id IS NOT NULL
  `;

  // Also release specific known Spotify IDs from ANY profile.
  if (knownSpotifyArtistIds.length > 0) {
    await sql`
      UPDATE creator_profiles
      SET spotify_id = NULL, spotify_url = NULL
      WHERE spotify_id = ANY(${knownSpotifyArtistIds})
    `;
  }

  // Bypass mode authenticates via test cookies, but the server only knows the
  // unique per-run email if we seed the matching DB row up front. Without
  // this, getCachedCurrentUser() falls back to the shared browse test persona
  // and onboarding submits against a mismatched identity.
  if (process.env.E2E_USE_TEST_AUTH_BYPASS === '1') {
    const [user] = (await sql`
      INSERT INTO users (clerk_id, email, name, user_status)
      VALUES (${clerkUserId}, ${email}, 'Golden Path', 'waitlist_approved')
      ON CONFLICT (clerk_id) DO UPDATE SET
        email = ${email},
        name = 'Golden Path',
        user_status = 'waitlist_approved',
        updated_at = NOW()
      RETURNING id
    `) as EnsuredUserRow[];

    if (!user?.id) {
      throw new Error(`Failed to ensure DB user for Clerk user ${clerkUserId}`);
    }

    return;
  }

  const [user] = (await sql`
    INSERT INTO users (clerk_id, email, user_status)
    VALUES (${clerkUserId}, ${email}, 'waitlist_approved')
    ON CONFLICT (clerk_id) DO UPDATE SET
      email = ${email},
      is_admin = false,
      user_status = 'waitlist_approved',
      updated_at = NOW()
    RETURNING id
  `) as EnsuredUserRow[];

  if (!user?.id) {
    throw new Error(`Failed to ensure DB user for Clerk user ${clerkUserId}`);
  }

  // Force "fresh user" tests back to a profile-less state for this Clerk ID.
  // Reused Clerk users in dev/test can carry an old claimed profile, which
  // causes /app to skip onboarding entirely even though the spec expects a
  // brand-new waitlist-approved user.
  await sql`
    DELETE FROM user_profile_claims
    WHERE user_id = ${user.id}
  `;

  await sql`
    UPDATE creator_profiles
    SET
      user_id = NULL,
      is_claimed = false,
      claimed_at = NULL,
      onboarding_completed_at = NULL,
      spotify_id = NULL,
      spotify_url = NULL,
      updated_at = NOW()
    WHERE user_id = ${user.id}
  `;

  await sql`
    UPDATE users
    SET
      active_profile_id = NULL,
      user_status = 'waitlist_approved',
      updated_at = NOW()
    WHERE id = ${user.id}
  `;

  await clearCachedUserState(clerkUserId);
}

export async function seedOnboardedCreatorProfile({
  clerkUserId,
  handle,
  displayName,
  spotifyId,
  spotifyUrl,
  careerHighlights = null,
}: SeedOnboardedCreatorProfileOptions): Promise<string> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL required for creator profile seeding');
  }

  const sql = neon(dbUrl);
  const normalizedHandle = handle.toLowerCase();
  const [user] = (await sql`
    SELECT id
    FROM users
    WHERE clerk_id = ${clerkUserId}
    LIMIT 1
  `) as EnsuredUserRow[];

  if (!user?.id) {
    throw new Error(`No DB user found for Clerk user ${clerkUserId}`);
  }

  await sql`
    UPDATE creator_profiles
    SET spotify_id = NULL, spotify_url = NULL, updated_at = NOW()
    WHERE spotify_id = ${spotifyId}
      AND (user_id IS NULL OR user_id <> ${user.id})
  `;

  const [profile] = (await sql`
    INSERT INTO creator_profiles (
      user_id,
      creator_type,
      username,
      username_normalized,
      display_name,
      spotify_id,
      spotify_url,
      avatar_url,
      career_highlights,
      is_public,
      is_claimed,
      claimed_at,
      onboarding_completed_at,
      settings,
      theme,
      ingestion_status,
      updated_at
    )
    VALUES (
      ${user.id},
      'artist',
      ${normalizedHandle},
      ${normalizedHandle},
      ${displayName},
      ${spotifyId},
      ${spotifyUrl},
      'https://images.unsplash.com/placeholder',
      ${careerHighlights},
      true,
      true,
      NOW(),
      NOW(),
      '{"spotifyImportStatus":"complete"}'::jsonb,
      '{}'::jsonb,
      'idle',
      NOW()
    )
    ON CONFLICT (username_normalized) WHERE username_normalized IS NOT NULL DO UPDATE SET
      user_id = ${user.id},
      display_name = ${displayName},
      spotify_id = ${spotifyId},
      spotify_url = ${spotifyUrl},
      avatar_url = COALESCE(creator_profiles.avatar_url, 'https://images.unsplash.com/placeholder'),
      career_highlights = ${careerHighlights},
      is_public = true,
      is_claimed = true,
      claimed_at = COALESCE(creator_profiles.claimed_at, NOW()),
      onboarding_completed_at = COALESCE(creator_profiles.onboarding_completed_at, NOW()),
      settings = creator_profiles.settings || '{"spotifyImportStatus":"complete"}'::jsonb,
      ingestion_status = 'idle',
      updated_at = NOW()
    RETURNING id
  `) as SeededCreatorProfileRow[];

  if (!profile?.id) {
    throw new Error(`Failed to seed creator profile for ${clerkUserId}`);
  }

  await sql`
    DELETE FROM user_profile_claims
    WHERE creator_profile_id = ${profile.id}
  `;

  await sql`
    INSERT INTO user_profile_claims (
      user_id,
      creator_profile_id,
      role,
      claimed_at
    )
    VALUES (${user.id}, ${profile.id}, 'owner', NOW())
  `;

  await sql`
    UPDATE users
    SET
      active_profile_id = ${profile.id},
      user_status = 'active',
      updated_at = NOW()
    WHERE id = ${user.id}
  `;

  await clearCachedUserState(clerkUserId);
  return profile.id;
}

/* ------------------------------------------------------------------ */
/*  Page helpers                                                        */
/* ------------------------------------------------------------------ */

/** Block fire-and-forget tracking calls that trigger slow Turbopack cascades. */
export async function interceptTrackingCalls(page: Page) {
  await page.route('**/api/profile/view', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', r => r.fulfill({ status: 200, body: '{}' }));
  await page.route('**/monitoring**', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
}

/**
 * Create a brand-new Clerk test user session.
 * Uses `+clerk_test` email suffix which auto-verifies in Clerk test mode.
 *
 * For +clerk_test emails, Clerk requires completing email verification
 * with the magic code 424242 before a session is created.
 */
export async function createFreshUser(page: Page, uniqueSeed: string) {
  const email = `gp-${uniqueSeed}+clerk_test@test.jovie.com`;

  if (process.env.E2E_USE_TEST_AUTH_BYPASS === '1') {
    const clerkUserId = await ensureClerkTestUser({
      email,
      username: `gp-${uniqueSeed}`.replaceAll(/[^a-z0-9-]/gi, '').slice(0, 32),
      firstName: 'Golden',
      lastName: 'Path',
      metadata: { source: 'e2e-smoke-bypass' },
    });

    await setTestAuthBypassSession(page, null, clerkUserId);
    return { email, clerkUserId };
  }

  await setupClerkTestingToken({ page });

  const loadClerk = async () => {
    await smokeNavigateWithRetry(page, '/signin', {
      timeout: 120_000,
      retries: 2,
    });

    for (let attempt = 0; attempt < 3; attempt++) {
      const loaded = await page
        .waitForFunction(
          () => !!(window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded,
          { timeout: 20_000 }
        )
        .then(() => true)
        .catch(() => false);

      if (loaded) return true;

      const retryButton = page.getByRole('button', { name: 'Retry now' });
      if (await retryButton.isVisible().catch(() => false)) {
        await retryButton.click();
      } else {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
      }
    }

    return false;
  };

  const loaded = await loadClerk();

  if (!loaded) {
    throw new Error('Clerk JS failed to load — cannot create test user');
  }

  const clerkUserId = await page.evaluate(async (targetEmail: string) => {
    const clerkInstance = (window as any).Clerk;
    if (!clerkInstance) throw new Error('Clerk not initialized');

    if (clerkInstance.user?.id && clerkInstance.session) {
      return clerkInstance.user.id as string;
    }

    const client = clerkInstance.client;
    if (!client?.signUp) throw new Error('Clerk client.signUp not available');

    const signUp = await client.signUp.create({
      emailAddress: targetEmail,
    });

    await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
    const result = await signUp.attemptEmailAddressVerification({
      code: '424242',
    });

    if (result.createdSessionId) {
      await clerkInstance.setActive({ session: result.createdSessionId });
    } else {
      throw new Error(
        `Signup completed with status "${result.status}" but no session was created`
      );
    }

    return clerkInstance.user?.id as string;
  }, email);

  if (!clerkUserId) {
    throw new Error('Clerk session not established after signup');
  }

  await page.waitForFunction(
    () => {
      const clerkInstance = (
        window as {
          Clerk?: {
            session?: { id?: string | null } | null;
            user?: { id?: string | null } | null;
          };
        }
      ).Clerk;

      return Boolean(clerkInstance?.session?.id && clerkInstance?.user?.id);
    },
    { timeout: 30_000 }
  );

  await expect
    .poll(
      async () => {
        const cookies = await page.context().cookies();
        return cookies.some(cookie => {
          return (
            cookie.name === '__session' ||
            cookie.name.startsWith('__clerk') ||
            cookie.name.startsWith('__client')
          );
        });
      },
      { timeout: 30_000 }
    )
    .toBe(true);

  const shouldAttachTestBypass =
    process.env.E2E_USE_TEST_AUTH_BYPASS === '1' ||
    process.env.E2E_ATTACH_TEST_AUTH_BYPASS_AFTER_SIGNUP === '1';

  if (shouldAttachTestBypass) {
    await ensureServerAuthenticated(page, clerkUserId);
  }

  await page.waitForTimeout(1_000);

  return { email, clerkUserId };
}
