import { neon } from '@neondatabase/serverless';
import { expect, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  ensureSignedInUser,
  fillControlledInputUntilEnabled,
  getAdminCredentials,
  hasAdminCredentials,
  prepareBetterAuthEmailOtp,
} from '../helpers/clerk-auth';
import {
  installRuntimeAutomationBypass,
  resetAuthStatePreservingOnboardingSession,
} from './utils/runtime-automation-bypass';

/**
 * Golden Path E2E — Anonymous Chat -> Signup -> Claim -> Live Profile
 *
 * Tests the complete new-user journey end to end with REAL data:
 * - Real anonymous conversation persistence and Better Auth signup
 * - Deterministic confirmed artist/handle tool-call fixtures
 * - Real claim endpoint and public profile activation
 * - No pre-authenticated state
 *
 * MusicFetch integration coverage remains in musicfetch-coverage.spec.ts.
 *
 * Jovie's pricing is a 14-day reverse trial with NO card required at signup
 * (see docs/PRICING-PHILOSOPHY.md), so the golden path's "first value" moment
 * is the artist's public profile going live with imported music — not a
 * paywall. Checkout is a post-activation upgrade path, not part of this
 * journey; persistence is covered by money-path-persistence.spec.ts.
 *
 * Test artist: "UNMARKED" (public catalog, no known Jovie owner)
 */

/* ------------------------------------------------------------------ */
/*  Environment gates                                                   */
/* ------------------------------------------------------------------ */

const REQUIRED_ENV = {
  DATABASE_URL: process.env.DATABASE_URL,
} as const;

const TEST_SPOTIFY_ARTIST = {
  id: '1ZlSI1juLMMN1HU8X7RViN',
  name: 'UNMARKED',
  url: 'https://open.spotify.com/artist/1ZlSI1juLMMN1HU8X7RViN',
} as const;

const IS_LOCAL_AUTH_BYPASS =
  process.env.E2E_USE_TEST_AUTH_BYPASS === '1' ||
  process.env.NEXT_PUBLIC_CLERK_MOCK === '1' ||
  process.env.NEXT_PUBLIC_CLERK_PROXY_DISABLED === '1';

function hasRealEnv(): boolean {
  return Object.values(REQUIRED_ENV).every(
    v => v && !v.includes('mock') && !v.includes('dummy')
  );
}

/**
 * Clear onboarding rate limits from Upstash Redis.
 * Repeated test runs exhaust the "3 per hour per IP" limit.
 */
async function clearOnboardingRateLimits() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return; // No Redis — rate limiting uses in-memory fallback

  try {
    // Find all onboarding IP rate limit keys
    const keysResp = await fetch(`${url}/keys/onboarding:ip:*`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const keysJson = (await keysResp.json()) as { result?: string[] };
    const keys = keysJson.result ?? [];

    if (keys.length > 0) {
      await fetch(`${url}/del/${keys.join('/')}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } catch {
    // Non-critical — if Redis is down, in-memory limiter resets per server restart
  }
}

/**
 * Approve the newly provisioned Better Auth user via direct Neon HTTP query.
 *
 * The onboarding page's server component creates users via the WebSocket
 * pool, but concurrent SSR renders in Next.js can abort the pool queries.
 * Provisioning happens in the Better Auth create hook; this update makes the
 * ephemeral test identity eligible to enter onboarding.
 *
 */
async function ensureDbUser(betterAuthUserId: string) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required for DB user creation');

  const sql = neon(dbUrl);

  // Clear onboarding rate limits from previous test runs
  await clearOnboardingRateLimits();

  await expect
    .poll(
      async () => {
        const [user] = await sql`
          UPDATE users
          SET user_status = 'waitlist_approved', updated_at = NOW()
          WHERE better_auth_user_id = ${betterAuthUserId}
          RETURNING id
        `;
        return user?.id ?? null;
      },
      {
        message:
          'Better Auth app-user provisioning hook did not create a linked users row',
        timeout: 30_000,
      }
    )
    .toBeTruthy();

  // The sign-in response is still withheld at this point, so the browser has
  // neither the new session cookie nor a chance to cache the pending state.
  // Approving here removes the old cache-invalidation race entirely.
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Block fire-and-forget tracking calls that trigger slow Turbopack cascades. */
async function interceptTrackingCalls(page: Page) {
  await page.route('**/api/profile/view', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', r => r.fulfill({ status: 200, body: '{}' }));
}

/**
 * Create a brand-new Better Auth test user through the visible email-OTP
 * signup surface. E2E_TEST_MODE supplies the deterministic 424242 code only
 * for canonical +e2e test addresses.
 */
async function createFreshUserOnce(page: import('@playwright/test').Page) {
  const email = `gp-${Date.now().toString(36)}+e2e@test.jovie.com`;
  const preparedAuth = await prepareBetterAuthEmailOtp(page, {
    email,
    entryPath: '/signup',
    beforeResponseFulfill: ensureDbUser,
  });

  // OTP verification hard-navigates to /start as soon as Better Auth returns.
  // New app users begin in the pending waitlist state, so approve the linked
  // app row while the sign-in response is withheld from the browser. This
  // preserves the real session cookie and lets the first /start mount perform
  // the one authoritative claim without racing the start-route auth gate.
  try {
    const automaticStartNavigationPromise = page.waitForURL(
      url => url.pathname === '/start',
      { waitUntil: 'domcontentloaded', timeout: 30_000 }
    );
    void automaticStartNavigationPromise.catch(() => undefined);
    const claimResponsePromise = page.waitForResponse(
      response =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/onboarding/claim',
      { timeout: 30_000 }
    );
    void claimResponsePromise.catch(() => undefined);
    const { betterAuthUserId } = await preparedAuth.submit();
    await automaticStartNavigationPromise;
    const claimResponse = await claimResponsePromise;
    expect(claimResponse.status()).toBe(200);
    const claimPayload = (await claimResponse.json()) as {
      claimed?: number;
      conversationId?: string;
      profile?: {
        profileId?: string;
        handle?: string;
        status?: string;
      };
    };

    return { email, betterAuthUserId, claimPayload };
  } finally {
    await preparedAuth.dispose();
  }
}

async function driveAnonymousOnboardingJourney(page: Page, handle: string) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required for onboarding proof');

  // Mark only this browser as local automation before React initializes so
  // the anonymous turn bypasses Turnstile without enabling auth bypass.
  await page.addInitScript(installRuntimeAutomationBypass);
  await page.route('**/api/chat', async route => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        'x-jovie-e2e-llm-failure': '1',
      },
    });
  });
  await page.goto('/start', { waitUntil: 'domcontentloaded' });
  await expect
    .poll(
      () =>
        page.evaluate(() => document.documentElement.dataset.e2eMode ?? null),
      {
        message: 'Golden path browser did not install its runtime marker',
        timeout: 30_000,
      }
    )
    .toBe('1');
  const input = page.locator('[aria-label="Chat message input" i]');
  await expect(input).toBeVisible({ timeout: 30_000 });
  const sendButton = page.getByRole('button', { name: 'Send message' });
  const sendChatMessage = async (text: string) => {
    await fillControlledInputUntilEnabled(input, sendButton, text);
    const [response] = await Promise.all([
      page.waitForResponse(
        candidate =>
          candidate.request().method() === 'POST' &&
          new URL(candidate.url()).pathname === '/api/chat'
      ),
      sendButton.click(),
    ]);
    expect(response.status()).toBe(200);
    await expect(input).toBeEditable({ timeout: 60_000 });
    return response;
  };

  // The product receives the real artist URL and resolves it through the
  // canonical deterministic onboarding engine. No tool event, profile field,
  // or catalog row is synthesized by the test.
  const artistResponse = await sendChatMessage(TEST_SPOTIFY_ARTIST.url);
  expect(artistResponse.headers()['x-onboarding-fallback']).toMatch(
    /^confirm_artist:/
  );
  await expect(
    page
      .getByText(TEST_SPOTIFY_ARTIST.name, { exact: true })
      .filter({ visible: true })
      .first(),
    'Real Spotify artist confirmation did not render the resolved identity'
  ).toBeVisible({ timeout: 60_000 });

  const handleResponse = await sendChatMessage('Set my profile handle');
  expect(handleResponse.headers()['x-onboarding-fallback']).toMatch(/^handle:/);
  const handleCard = page.getByTestId('onboarding-handle-check');
  await expect(handleCard).toBeVisible({ timeout: 60_000 });
  await handleCard.getByLabel('Edit Proposed Handle').fill(handle);
  await expect(handleCard.getByText('is available')).toBeVisible({
    timeout: 30_000,
  });
  const confirmHandle = handleCard.getByTestId('onboarding-confirm-handle');
  await expect(confirmHandle).toBeEnabled({ timeout: 30_000 });
  const [confirmedHandleResponse] = await Promise.all([
    page.waitForResponse(
      candidate =>
        candidate.request().method() === 'POST' &&
        new URL(candidate.url()).pathname === '/api/chat'
    ),
    confirmHandle.click(),
  ]);
  expect(confirmedHandleResponse.status()).toBe(200);
  await expect(page.getByTestId('onboarding-social-link')).toBeVisible({
    timeout: 60_000,
  });

  const confirmedRequestBody = confirmedHandleResponse
    .request()
    .postDataJSON() as {
    messages?: Array<{ id?: string; role?: string }>;
  };
  const confirmedClientMessageId = confirmedRequestBody.messages
    ?.toReversed()
    .find(message => message.role === 'user')?.id;
  expect(
    confirmedClientMessageId,
    'Handle confirmation request did not include a user message id'
  ).toBeTruthy();

  const requestBody = artistResponse.request().postDataJSON() as {
    messages?: Array<{ id?: string; role?: string }>;
  };
  const clientMessageId = requestBody.messages
    ?.toReversed()
    .find(message => message.role === 'user')?.id;
  expect(
    clientMessageId,
    'Anonymous chat request did not include a user message id'
  ).toBeTruthy();

  const sql = neon(dbUrl);
  const persistedMessages = await sql`
    SELECT conversation_id
    FROM chat_messages
    WHERE client_message_id = ${clientMessageId}
      AND role = 'user'
    ORDER BY created_at DESC
    LIMIT 2
  `;
  expect(
    persistedMessages.length,
    'Anonymous chat user message was not persisted exactly once'
  ).toBe(1);
  const conversationId = persistedMessages[0]?.conversation_id;
  expect(
    conversationId,
    'Anonymous chat did not reserve a conversation'
  ).toBeTruthy();

  const readConfirmedTurnConversation = async () => {
    const [proof] = await sql`
      SELECT conversation_id
      FROM chat_messages
      WHERE client_message_id = ${confirmedClientMessageId}
        AND role = 'user'
      ORDER BY created_at DESC
      LIMIT 2
    `;
    return proof?.conversation_id ?? null;
  };

  await expect
    .poll(readConfirmedTurnConversation, {
      message:
        'Handle confirmation forked away from the original anonymous conversation',
      timeout: 30_000,
    })
    .toBe(conversationId);

  const confirmedAssistantMessageId = `assistant:${confirmedClientMessageId}`;

  const readPersistedConfirmedHandle = async () => {
    const [proof] = await sql`
      SELECT event.value -> 'output' ->> 'handle' AS handle
      FROM chat_messages message
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(message.tool_calls, '[]'::jsonb)
      ) AS event(value)
      WHERE message.conversation_id = ${conversationId}
        AND message.client_message_id = ${confirmedAssistantMessageId}
        AND event.value -> 'output' ->> 'action' = 'handle_confirmed'
      ORDER BY message.created_at DESC
      LIMIT 1
    `;
    return proof?.handle ?? null;
  };

  await expect
    .poll(readPersistedConfirmedHandle, {
      message:
        'Confirmed handle was visible but not durable in the claim transcript',
      timeout: 30_000,
    })
    .toBe(handle);

  return conversationId;
}

async function createFreshUser(page: import('@playwright/test').Page) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      return await createFreshUserOnce(page);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const lowerMessage = message.toLowerCase();
      const isRetryable =
        lowerMessage.includes('captcha') ||
        lowerMessage.includes('statement timeout') ||
        lowerMessage.includes('canceling statement');
      if (!isRetryable || attempt === 6) {
        throw error;
      }

      await resetAuthStatePreservingOnboardingSession(page.context());
      await page
        .evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        })
        .catch(() => {});
      await page.waitForTimeout(2000 * attempt);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to create Better Auth test user');
}

/* ------------------------------------------------------------------ */
/*  Test suite                                                          */
/* ------------------------------------------------------------------ */

test.describe('Golden Path: Anonymous Chat -> Signup -> Claim -> Live Profile', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  // Fresh browser — no inherited auth state
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    if (IS_LOCAL_AUTH_BYPASS) {
      test.skip(
        true,
        'Golden path requires the dedicated real-auth lane, not the smoke auth bypass'
      );
    }

    if (!hasRealEnv()) {
      test.skip(true, 'Better Auth/DB env vars not configured');
    }

    await interceptTrackingCalls(page);
  });

  test('complete user journey from signup to live public profile', async ({
    page,
    browser,
  }) => {
    test.setTimeout(600_000);

    // ──────────────────────────────────────────────────────────────────
    // STEP 1: Landing page loads
    // ──────────────────────────────────────────────────────────────────
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // The certified homepage (JOV-5864) routes onboarding through /start chat;
    // the hero's conversion control is the name search, not a command center.
    await expect(
      page.getByTestId('homepage-editorial-hero-search')
    ).toBeVisible({
      timeout: 20_000,
    });

    // ──────────────────────────────────────────────────────────────────
    // STEP 2: Start the canonical anonymous chat journey
    // ──────────────────────────────────────────────────────────────────
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const uniqueHandle = `t${Date.now().toString(36)}${randomSuffix}`;
    const conversationId = await driveAnonymousOnboardingJourney(
      page,
      uniqueHandle
    );

    // ──────────────────────────────────────────────────────────────────
    // STEP 3: Create account
    // ──────────────────────────────────────────────────────────────────
    const sql = neon(process.env.DATABASE_URL!);
    const conflictingProfiles = await sql`
      SELECT cp.id, cp.username_normalized, u.email
      FROM creator_profiles cp
      INNER JOIN users u ON u.id = cp.user_id
      WHERE cp.spotify_id = ${TEST_SPOTIFY_ARTIST.id}
    `;
    expect(
      conflictingProfiles,
      `Protected Golden Path fixture is already owned; refusing to detach ${TEST_SPOTIFY_ARTIST.id}: ${JSON.stringify(conflictingProfiles)}`
    ).toHaveLength(0);

    const { betterAuthUserId, claimPayload } = await createFreshUser(page);

    // Assert the real client auto-claim response captured during OTP completion.
    // A duplicate request here would race the hook and mask which caller won.
    expect(claimPayload).toMatchObject({
      claimed: 1,
      conversationId,
      profile: {
        profileId: expect.any(String),
        handle: uniqueHandle,
        status: 'created',
      },
    });

    const readClaimedProfileProof = async () => {
      const [proof] = await sql`
        SELECT cp.id,
               cp.spotify_id AS "spotifyId",
               cp.spotify_url AS "spotifyUrl",
               cp.display_name AS "displayName",
               cp.avatar_url AS "avatarUrl",
               cp.is_public AS "isPublic",
               cp.is_claimed AS "isClaimed",
               cp.onboarding_completed_at AS "onboardingCompletedAt",
               cp.settings #>> '{onboarding,selectedSpotifyArtistId}' AS "selectedSpotifyArtistId",
               u.id AS "appUserId",
               u.active_profile_id AS "activeProfileId",
               c.user_id AS "conversationUserId",
               c.creator_profile_id AS "conversationProfileId",
               (
                 SELECT COUNT(*)::int
                 FROM user_profile_claims upc
                 WHERE upc.user_id = u.id
                   AND upc.creator_profile_id = cp.id
                   AND upc.role = 'owner'
               ) AS "ownerClaimCount"
        FROM creator_profiles cp
        INNER JOIN users u ON u.id = cp.user_id
        INNER JOIN chat_conversations c ON c.id = ${conversationId}
        WHERE u.better_auth_user_id = ${betterAuthUserId}
          AND cp.username_normalized = ${uniqueHandle}
      `;
      return proof ?? null;
    };

    await expect
      .poll(readClaimedProfileProof, {
        message:
          'Claim did not persist the real Spotify identity and exact owner links',
        timeout: 60_000,
      })
      .toMatchObject({
        spotifyId: TEST_SPOTIFY_ARTIST.id,
        spotifyUrl: TEST_SPOTIFY_ARTIST.url,
        displayName: TEST_SPOTIFY_ARTIST.name,
        avatarUrl: expect.stringMatching(/^https?:\/\//),
        isPublic: true,
        isClaimed: true,
        onboardingCompletedAt: expect.anything(),
        selectedSpotifyArtistId: TEST_SPOTIFY_ARTIST.id,
        ownerClaimCount: 1,
      });
    const claimedProfile = await readClaimedProfileProof();
    expect(claimedProfile).not.toBeNull();
    const profileId = claimedProfile?.id as string;
    expect(claimedProfile?.activeProfileId).toBe(profileId);
    expect(claimedProfile?.conversationProfileId).toBe(profileId);
    expect(claimedProfile?.conversationUserId).toBe(claimedProfile?.appUserId);

    // ──────────────────────────────────────────────────────────────────
    // STEP 7: Dashboard loaded — profile is sufficiently complete
    // ──────────────────────────────────────────────────────────────────
    await expect(async () => {
      const response = await page.goto('/app/chat', {
        waitUntil: 'commit',
        timeout: 90_000,
      });

      expect(
        response?.status() ?? 0,
        'Dashboard route should respond after profile completion'
      ).toBeLessThan(400);
    }).toPass({
      timeout: 240_000,
      intervals: [5_000, 10_000, 20_000],
    });

    const currentUrl = page.url();
    expect(
      currentUrl,
      'Redirected to onboarding — profile not saved'
    ).not.toContain('/onboarding');
    expect(currentUrl, 'Redirected to signin — auth lost').not.toContain(
      '/sign-in'
    );

    // Drive the canonical product import owner. The test never writes profile
    // identity or catalog rows; the server action performs a real Spotify sync.
    await page.goto(APP_ROUTES.RELEASES, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
    const syncButton = page
      .locator(
        '[data-testid="library-sync-spotify-empty-state"], [data-testid="sync-spotify-empty-state"], [data-testid="shell-releases-sync-empty-state"]'
      )
      .filter({ visible: true })
      .first();
    await expect(
      syncButton,
      'Claimed Spotify profile did not expose the canonical catalog import action'
    ).toBeVisible({ timeout: 60_000 });
    await syncButton.click();

    await expect
      .poll(
        async () => {
          const [proof] = await sql`
            SELECT COUNT(DISTINCT r.id)::int AS "releaseCount",
                   COUNT(DISTINCT rt.id)::int AS "trackCount",
                   COUNT(DISTINCT pl.id) FILTER (
                     WHERE pl.provider_id = 'spotify'
                       AND pl.source_type = 'ingested'
                       AND pl.url LIKE 'https://open.spotify.com/album/%'
                   )::int AS "spotifyProviderCount",
                   COUNT(DISTINCT r.id) FILTER (
                     WHERE r.source_type <> 'ingested'
                   )::int AS "wrongReleaseCount",
                   COUNT(DISTINCT r.id) FILTER (
                     WHERE cp.spotify_id IS DISTINCT FROM ${TEST_SPOTIFY_ARTIST.id}::text
                   )::int AS "wrongArtistOwnerCount",
                   COUNT(DISTINCT rt.id) FILTER (
                     WHERE rt.source_type <> 'ingested'
                       OR rec.creator_profile_id <> ${profileId}
                   )::int AS "wrongTrackCount"
            FROM discog_releases r
            INNER JOIN creator_profiles cp ON cp.id = r.creator_profile_id
            LEFT JOIN discog_release_tracks rt ON rt.release_id = r.id
            LEFT JOIN discog_recordings rec ON rec.id = rt.recording_id
            LEFT JOIN provider_links pl ON pl.release_id = r.id
            WHERE r.creator_profile_id = ${profileId}
              AND r.deleted_at IS NULL
          `;
          return {
            ...proof,
            ready:
              Number(proof?.releaseCount ?? 0) > 0 &&
              Number(proof?.trackCount ?? 0) > 0 &&
              Number(proof?.spotifyProviderCount ?? 0) > 0 &&
              proof?.wrongReleaseCount === 0 &&
              proof?.wrongArtistOwnerCount === 0 &&
              proof?.wrongTrackCount === 0,
          };
        },
        {
          message:
            'Real Spotify import did not persist an owned release, track, and provider link',
          timeout: 180_000,
          intervals: [2_000, 5_000, 10_000],
        }
      )
      .toMatchObject({
        ready: true,
        wrongReleaseCount: 0,
        wrongArtistOwnerCount: 0,
        wrongTrackCount: 0,
      });
    const [importedRelease] = await sql`
      SELECT r.title, r.slug, pl.url AS "spotifyUrl"
      FROM discog_releases r
      INNER JOIN provider_links pl
        ON pl.release_id = r.id AND pl.provider_id = 'spotify'
      WHERE r.creator_profile_id = ${profileId}
        AND r.source_type = 'ingested'
        AND r.deleted_at IS NULL
      ORDER BY r.release_date DESC NULLS LAST, r.created_at DESC
      LIMIT 1
    `;
    expect(importedRelease, 'Imported catalog proof disappeared').toBeTruthy();

    // Verify the newly created user is visible in the admin dashboard.
    if (hasAdminCredentials()) {
      const adminContext = await browser.newContext();
      const adminPage = await adminContext.newPage();

      try {
        await ensureSignedInUser(adminPage, getAdminCredentials());

        await adminPage.goto(APP_ROUTES.HUD, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        });
        await expect(
          adminPage.locator('[data-testid="hud-admin-page"]')
        ).toBeVisible({ timeout: 30_000 });
        await expect(
          adminPage.locator('[data-testid="tim-action-required"]')
        ).toBeVisible({
          timeout: 30_000,
        });

        const usersParams = new URLSearchParams({
          view: 'users',
          q: uniqueHandle,
        });
        await adminPage.goto(
          `${APP_ROUTES.ADMIN_USERS}?${usersParams.toString()}`,
          {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
          }
        );

        await expect(
          adminPage.getByText(`@${uniqueHandle}`).first()
        ).toBeVisible({ timeout: 30_000 });
      } finally {
        await adminContext.close().catch(() => undefined);
      }
    } else {
      console.warn(
        '[golden-path] Skipping admin dashboard verification — no admin credentials configured'
      );
    }

    // ──────────────────────────────────────────────────────────────────
    // STEP 8: First value — the artist's public profile is LIVE
    // ──────────────────────────────────────────────────────────────────
    // Reverse-trial pricing means there is no paywall between signup and
    // value: the artist's first "win" is a live, public, shareable profile
    // with their music imported. Render it as an anonymous fan would —
    // fresh browser context, no auth — the way a real fan clicking a link
    // in bio would land here.
    const fanContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const fanPage = await fanContext.newPage();
    await interceptTrackingCalls(fanPage);

    try {
      await expect(async () => {
        const response = await fanPage.goto(`/${uniqueHandle}?mode=listen`, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
        expect(
          response?.status() ?? 0,
          'Public profile did not render live'
        ).toBe(200);

        // The h1 must render the imported artist's real display name (not
        // just any non-empty heading), so this can't pass on a placeholder
        // or unrelated page.
        const h1 = fanPage.locator('h1').first();
        await expect(h1, 'Artist name missing on public profile').toBeVisible({
          timeout: 10_000,
        });
        await expect(
          h1,
          'Artist name does not match imported artist'
        ).toHaveText(TEST_SPOTIFY_ARTIST.name, { timeout: 10_000 });

        await expect(
          fanPage
            .getByText(String(importedRelease?.title), { exact: true })
            .first(),
          'Imported release title is missing from the public profile'
        ).toBeVisible({ timeout: 10_000 });

        // Match the exact release-provider URL persisted by the real import;
        // a generic artist-level Spotify button cannot satisfy this proof.
        // The canonical profile composition keeps fans inside Jovie first:
        // release rows open /{handle}/{releaseSlug}, and the exact provider
        // destination lives on that release page with tracking parameters.
        const releasePath = `/${uniqueHandle}/${String(importedRelease?.slug)}`;
        const releaseLink = fanPage
          .locator(`a[href="${releasePath}"]`)
          .filter({ hasText: String(importedRelease?.title) })
          .first();
        await expect(
          releaseLink,
          'Imported release does not link to its canonical Jovie release page'
        ).toBeVisible({ timeout: 10_000 });
        await releaseLink.click();
        await expect(fanPage).toHaveURL(
          new RegExp(`${releasePath.replaceAll('/', '\\/')}(?:\\?.*)?$`),
          { timeout: 30_000 }
        );

        await expect(
          fanPage
            .locator(`a[href^="${String(importedRelease?.spotifyUrl)}"]`)
            .first(),
          'Imported Spotify release link is not live on the release page'
        ).toBeVisible({ timeout: 10_000 });
      }).toPass({
        timeout: 180_000,
        intervals: [5_000, 10_000, 20_000],
      });
    } finally {
      await fanContext.close();
    }
  });
});
