import { neon } from '@neondatabase/serverless';
import { expect, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { productionUpstashCredentials } from '@/lib/redis-store';
import {
  ensureSignedInUser,
  fillControlledInputUntilEnabled,
  getAdminCredentials,
  hasAdminCredentials,
  prepareBetterAuthEmailOtp,
} from '../helpers/auth';
import { completeGoldenPathBillingJourney } from './helpers/golden-path-billing';
import { openHomeWelcome } from './helpers/golden-path-home-welcome';
import {
  captureKeyframe,
  inspectEssentialViewport,
  watchKeyframeErrors,
} from './helpers/golden-path-keyframes';
import {
  installRuntimeAutomationBypass,
  resetAuthStatePreservingOnboardingSession,
} from './utils/runtime-automation-bypass';

/**
 * Golden Path E2E — Anonymous Chat -> Auth -> Claim -> Catalog -> Billing
 *
 * Tests the complete new-user journey end to end with REAL data:
 * - Real anonymous conversation persistence and Better Auth signup
 * - Deterministic confirmed artist/handle tool-call fixtures
 * - Real claim endpoint and public profile activation
 * - No pre-authenticated state
 *
 * MusicFetch integration coverage remains in musicfetch-coverage.spec.ts.
 *
 * The profile first-value proof and post-activation Stripe persistence proof
 * intentionally share one identity, claim, catalog, and production build.
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
const IS_REQUIRED_GOLDEN_PATH = process.env.GOLDEN_PATH_REQUIRED === '1';

/** Auth is real from this journey; Insight responses below are presentation fixtures. */
async function verifyHomeWelcome(page: Page) {
  const insight = {
    id: 'home-tip-fixture',
    insightType: 'tip_hotspot',
    category: 'revenue',
    priority: 'high',
    title: '27 tip link clicks, zero tips completed',
    description: '',
    actionSuggestion: 'Close the conversion gap.',
    confidence: '0.90',
    status: 'active',
    periodStart: new Date(Date.now() - 86_400_000).toISOString(),
    periodEnd: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
  let mode: 'action' | 'empty' | 'error' = 'action';
  let releaseSummary: () => void = () => {};
  const ready = new Promise<void>(resolve => {
    releaseSummary = resolve;
  });
  let chatPosts = 0;
  const watchPosts = (request: import('@playwright/test').Request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/chat'
    )
      chatPosts++;
  };
  page.on('request', watchPosts);
  await page.route('**/api/insights/summary', async route => {
    await ready;
    if (mode === 'error') {
      await route
        .fulfill({
          status: 500,
          json: { error: 'Controlled summary failure' },
        })
        .catch(() => {});
      return;
    }
    // An earlier aborted summary must not reject the live fulfill.
    await route
      .fulfill({
        json: {
          insights:
            mode === 'empty'
              ? []
              : [
                  {
                    ...insight,
                    id: 'expired',
                    expiresAt: new Date(Date.now() - 1000).toISOString(),
                  },
                  insight,
                ],
          totalActive: mode === 'empty' ? 0 : 1,
          lastGeneratedAt: new Date().toISOString(),
        },
      })
      .catch(() => {});
  });
  const heading = page.getByTestId('chat-empty-state-greeting-text');
  const input = page.getByRole('textbox', {
    name: 'Chat message input',
    exact: false,
  });
  const nextStep = page.getByTestId('chat-empty-state-next-step');
  const measureCenter = () =>
    page.evaluate(() => {
      const group = document.querySelector(
        '[data-testid="chat-empty-state-greeting-region"]'
      );
      const usable = document.querySelector(
        '[data-testid="chat-empty-state-above-scroll"]'
      );
      if (!group || !usable) return null;
      const box = group.getBoundingClientRect(),
        region = usable.getBoundingClientRect();
      const style = getComputedStyle(usable);
      const top = region.top + parseFloat(style.paddingTop),
        bottom = region.bottom - parseFloat(style.paddingBottom);
      return {
        delta: Math.abs((box.top + box.bottom) / 2 - (top + bottom) / 2),
        tolerance: Math.max(4, (bottom - top) * 0.02),
      };
    });
  const assertGeometry = async () => {
    const selectors = [
      '[data-testid="chat-empty-state-next-step"] button, [data-testid="chat-empty-state-next-step"] a',
    ];
    for (const button of await page
      .getByTestId('chat-composer-surface')
      .getByRole('button')
      .all()) {
      const name = await button.getAttribute('aria-label');
      const painted = await button.evaluate(el => {
        const box = el.getBoundingClientRect();
        return (
          box.width > 0 &&
          box.height > 0 &&
          getComputedStyle(el).opacity !== '0'
        );
      });
      if (name && painted)
        selectors.push(
          `[data-testid="chat-composer-surface"] button[aria-label=${JSON.stringify(name)}]`
        );
    }
    expect(
      await inspectEssentialViewport(page, [
        ...selectors,
        '[data-testid="chat-empty-state-greeting-text"]',
        '[data-testid="chat-empty-state-next-step"]',
        '[data-testid="chat-composer-surface"]',
        '[aria-label="Chat message input" i]',
      ])
    ).toEqual({ supported: true, findings: [] });
    const centering = await measureCenter();
    expect(centering).not.toBeNull();
    if (centering)
      expect(centering.delta).toBeLessThanOrEqual(centering.tolerance);
    await expect(heading).toHaveCount(1);
    await expect(heading).toContainText(TEST_SPOTIFY_ARTIST.name.split(' ')[0]);
    await expect(nextStep).toHaveCount(1);
    await expect(page.getByTestId('chat-empty-state-sample')).toHaveCount(0);
    await expect(page.getByText(insight.title, { exact: true })).toHaveCount(0);
  };
  try {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 615, height: 407 },
    ]) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({
        reducedMotion: viewport.width === 615 ? 'reduce' : 'no-preference',
      });
      const { initialGreeting, before } = await openHomeWelcome(
        page,
        viewport.width === 1440 ? releaseSummary : undefined
      );
      const action = page.getByRole('button', {
        name: 'Draft This With Jovie',
      });
      await expect(action).toBeVisible();
      await expect(nextStep.locator('[data-insight-id]')).toHaveAttribute(
        'data-insight-id',
        insight.id
      );
      await expect(heading).toHaveText(initialGreeting!);
      const after = await input.boundingBox();
      expect(before).not.toBeNull();
      expect(after).not.toBeNull();
      if (before && after)
        expect(Math.abs(before.y - after.y)).toBeLessThanOrEqual(1);
      await assertGeometry();
      if (viewport.width === 1440) {
        // Independent deliberate red: truthful content, wrong bottom placement.
        const group = page.locator('[data-empty-chat-suggestions]');
        const previousStyle = await group.getAttribute('style');
        await group.evaluate(el => {
          (el as HTMLElement).style.marginTop = 'auto';
          (el as HTMLElement).style.marginBottom = '0';
        });
        const misplaced = await measureCenter();
        expect(misplaced).not.toBeNull();
        if (misplaced)
          expect(misplaced.delta).toBeGreaterThan(misplaced.tolerance);
        await group.evaluate((el, style) => {
          if (style === null) el.removeAttribute('style');
          else el.setAttribute('style', style);
        }, previousStyle);
        await assertGeometry();
      }
      await action.focus();
      await page.keyboard.press('Enter');
      await expect(input).toHaveValue(new RegExp(`Insight ${insight.id}:`));
      await expect(input).toBeFocused();
      expect(chatPosts).toBe(0);
      await input.fill('');
      await assertGeometry();
      await page.waitForTimeout(1000); // Idle effects are part of the contract.
      await assertGeometry();
      await page.reload();
      await expect(action).toBeVisible();
      await assertGeometry();
      expect(chatPosts).toBe(0);
      if (process.env.GOLDEN_PATH_KEYFRAME_DIR)
        await captureKeyframe(page, `home-welcome-${viewport.width}`, {
          expectedArtistName: TEST_SPOTIFY_ARTIST.name,
        });
    }
    for (const state of ['empty', 'error'] as const) {
      mode = state;
      await page.goto(APP_ROUTES.CHAT);
      await expect(
        page.getByRole('link', { name: 'Review Your Profile' })
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByRole('button', { name: 'Draft This With Jovie' })
      ).toHaveCount(0);
      await assertGeometry();
    }
  } finally {
    releaseSummary();
    page.off('request', watchPosts);
    await page.unroute('**/api/insights/summary');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
}

function hasRealEnv(): boolean {
  return Object.values(REQUIRED_ENV).every(
    v => v && !v.includes('mock') && !v.includes('dummy')
  );
}

/**
 * Clear onboarding rate limits from production Upstash.
 * Non-production runs use the in-memory limiter, which resets with the process.
 */
async function clearOnboardingRateLimits() {
  const credentials = productionUpstashCredentials();
  if (!credentials) return;
  const { url, token } = credentials;

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

/** Exercise the Google handoff and its denied-provider recovery UI. */
async function exerciseGoogleProviderRecovery(page: Page): Promise<void> {
  const signupPath = `/signup?plan=pro&interval=month&artist_name=${encodeURIComponent(TEST_SPOTIFY_ARTIST.name)}&redirect_url=%2Fstart`;
  await page.goto(signupPath, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-auth-shell-hydrated="true"]')).toBeVisible({
    timeout: 30_000,
  });
  const signupOrigin = new URL(page.url()).origin;
  let errorReturn: string | null = null;

  const googleRoute = async (route: import('@playwright/test').Route) => {
    await route.abort('aborted');
  };
  const socialRoute = async (route: import('@playwright/test').Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        redirect: true,
        url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=golden-path&redirect_uri=http%3A%2F%2Flocalhost%3A3250%2Fapi%2Fauth%2Fcallback%2Fgoogle',
      }),
    });
  };
  // Provider credentials and consent remain Google-owned. Stub only the
  // transport response at the Better Auth boundary, then exercise the real
  // hydrated button, redirect behavior, denial return, and saved offer state.
  await page.route('**/api/auth/sign-in/social', socialRoute);
  await page.route('https://accounts.google.com/**', googleRoute);
  try {
    const socialPost = page.waitForRequest(
      request =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/auth/sign-in/social',
      { timeout: 30_000 }
    );
    const providerNavigation = page.waitForRequest(
      request =>
        request.isNavigationRequest() &&
        new URL(request.url()).hostname === 'accounts.google.com',
      { timeout: 30_000 }
    );
    await page
      .locator('button[data-auth-provider-slot="google"]')
      .click({ noWaitAfter: true });
    const [request, providerRequest] = await Promise.all([
      socialPost,
      providerNavigation,
    ]);
    const body = request.postDataJSON() as Record<string, unknown>;
    expect(body.provider).toBe('google');
    // Auth returns through the server entry so access and subscriber state
    // resolve before checkout. Every callback must retain the explicit intent.
    for (const field of [
      'callbackURL',
      'newUserCallbackURL',
      'errorCallbackURL',
    ] as const) {
      expect(body[field]).toEqual(expect.any(String));
      expect(body[field]).not.toBe('');
      const callback = new URL(String(body[field]), signupOrigin);
      expect(callback.origin).toBe(signupOrigin);
      expect(callback.pathname).toBe(APP_ROUTES.SIGNUP);
      expect(callback.username).toBe('');
      expect(callback.password).toBe('');
      expect(callback.hash).toBe('');
      for (const [key, value] of Object.entries({
        redirect_url: APP_ROUTES.START,
        plan: 'pro',
        interval: 'month',
        artist_name: TEST_SPOTIFY_ARTIST.name,
      })) {
        expect(callback.searchParams.getAll(key)).toEqual([value]);
      }
      expect(callback.searchParams.getAll('oauth_error')).toEqual([]);
      expect(callback.searchParams.getAll('error')).toEqual(
        field === 'errorCallbackURL' ? ['oauth_failed'] : []
      );
      if (field === 'errorCallbackURL')
        errorReturn = callback.pathname + callback.search;
    }
    expect(new URL(providerRequest.url()).hostname).toBe('accounts.google.com');
  } finally {
    await page.unroute('**/api/auth/sign-in/social', socialRoute);
    await page.unroute('https://accounts.google.com/**', googleRoute);
  }

  expect(errorReturn).not.toBeNull();
  await page.goto(errorReturn!, {
    waitUntil: 'domcontentloaded',
  });
  // JOV-8349: keep a missing canonical recovery message red while continuing
  // the same identity's email fallback and downstream Home/billing checks.
  await expect
    .soft(page.getByRole('alert').first())
    .toContainText('Something went wrong with sign-up. Please try again.', {
      timeout: 30_000,
    });
  const savedIntent = await page.evaluate(() =>
    sessionStorage.getItem('jovie_plan_intent')
  );
  expect(savedIntent).toBeTruthy();
  expect(JSON.parse(String(savedIntent))).toMatchObject({
    artist: TEST_SPOTIFY_ARTIST.name,
    interval: 'month',
    plan: 'pro',
  });

  // Continue through the product's card-free first-value path before upgrading.
  // This overwrites only the offer tier; the anonymous claim session and artist
  // survive into email fallback, and billing later receives explicit correlation.
  await page.goto(
    `/signup?plan=free&artist_name=${encodeURIComponent(TEST_SPOTIFY_ARTIST.name)}&redirect_url=%2Fstart`,
    { waitUntil: 'domcontentloaded' }
  );
  await expect(page.locator('[data-auth-shell-hydrated="true"]')).toBeVisible({
    timeout: 30_000,
  });
  const fallbackIntent = await page.evaluate(() =>
    sessionStorage.getItem('jovie_plan_intent')
  );
  expect(JSON.parse(String(fallbackIntent))).toMatchObject({
    artist: TEST_SPOTIFY_ARTIST.name,
    plan: 'free',
  });
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
    recovery: {
      initialEmail: email.replace('gp-', 'gp-abandoned-'),
      resendCode: true,
    },
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

test.describe('Golden Path: auth -> claim -> catalog -> billing -> return', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  // Fresh browser — no inherited auth state
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    if (IS_LOCAL_AUTH_BYPASS) {
      if (IS_REQUIRED_GOLDEN_PATH) {
        throw new Error(
          'Required Golden Path refuses the smoke auth bypass identity'
        );
      }
      test.skip(
        true,
        'Golden path requires the dedicated real-auth lane, not the smoke auth bypass'
      );
    }

    if (!hasRealEnv()) {
      if (IS_REQUIRED_GOLDEN_PATH) {
        throw new Error('Required Golden Path is missing its real database');
      }
      test.skip(true, 'Better Auth/DB env vars not configured');
    }

    if (IS_REQUIRED_GOLDEN_PATH && process.env.E2E_TEST_MODE !== '1') {
      throw new Error('Required Golden Path is missing deterministic OTP mode');
    }

    await interceptTrackingCalls(page);
  });

  test('completes one identity from provider recovery through revoked return', async ({
    page,
    browser,
  }) => {
    test.setTimeout(900_000);
    // JOV-5489: keyframes for the recorded visual review (no-op unless enabled).
    watchKeyframeErrors(page);

    // ──────────────────────────────────────────────────────────────────
    // STEP 1: Landing page loads
    // ──────────────────────────────────────────────────────────────────
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // The certified homepage (JOV-5864) routes onboarding through /start chat.
    // The hero's conversion control carries the homepage-primary-cta testid in
    // both certified states: the name search when open, or the waitlist-gated
    // Request access link while prelaunch (JOV-6794) — never a command center.
    await expect(page.getByTestId('homepage-primary-cta')).toBeVisible({
      timeout: 20_000,
    });
    await captureKeyframe(page, 'home');

    // ──────────────────────────────────────────────────────────────────
    // STEP 2: Start the canonical anonymous chat journey
    // ──────────────────────────────────────────────────────────────────
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const uniqueHandle = `t${Date.now().toString(36)}${randomSuffix}`;
    const conversationId = await driveAnonymousOnboardingJourney(
      page,
      uniqueHandle
    );
    await captureKeyframe(page, 'anonymous-chat');

    // ──────────────────────────────────────────────────────────────────
    // STEP 3: Create account
    // ──────────────────────────────────────────────────────────────────
    const sql = neon(process.env.DATABASE_URL!);
    const databaseRole = decodeURIComponent(
      new URL(process.env.DATABASE_URL!).username
    );
    const [databaseContract] = await sql`
      SELECT current_user AS role,
             current_schema() AS schema,
             to_regclass('public.users') IS NOT NULL AS "hasUsers",
             to_regclass('public.creator_profiles') IS NOT NULL AS "hasProfiles",
             to_regclass('public.user_profile_claims') IS NOT NULL AS "hasClaims",
             to_regclass('public.stripe_webhook_events') IS NOT NULL AS "hasStripeEvents"
    `;
    expect(databaseContract).toMatchObject({
      role: databaseRole,
      schema: 'public',
      hasUsers: true,
      hasProfiles: true,
      hasClaims: true,
      hasStripeEvents: true,
    });
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

    await exerciseGoogleProviderRecovery(page);
    const { email, betterAuthUserId, claimPayload } =
      await createFreshUser(page);

    // JOV-8068: the mount claim transfers transcript ownership only. It must
    // NOT materialize a profile or authorize a checkout handoff before the
    // interview reaches a server-verified terminal next-step decision.
    expect(claimPayload).toMatchObject({
      claimed: 1,
      conversationId,
    });
    expect(claimPayload).not.toHaveProperty('readyForCheckout');

    // Finish the interview as the now-signed-in user. Meaningful free text
    // after the social card is the access-decision turn: the scripted engine
    // persists a terminal proposeNextStep decision, the post-turn claim
    // resolves the handoff, and only then is the profile materialized.
    const signedInInput = page.locator('[aria-label="Chat message input" i]');
    await expect(signedInInput).toBeVisible({ timeout: 60_000 });
    const signedInSend = page.getByRole('button', { name: 'Send message' });
    await fillControlledInputUntilEnabled(
      signedInInput,
      signedInSend,
      'About 500 monthly listeners right now'
    );
    const [decisionResponse] = await Promise.all([
      page.waitForResponse(
        candidate =>
          candidate.request().method() === 'POST' &&
          new URL(candidate.url()).pathname === '/api/chat'
      ),
      signedInSend.click(),
    ]);
    expect(decisionResponse.status()).toBe(200);

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
                 SELECT upc.id
                 FROM user_profile_claims upc
                 WHERE upc.user_id = u.id
                   AND upc.creator_profile_id = cp.id
                   AND upc.role = 'owner'
                 ORDER BY upc.created_at ASC
                 LIMIT 1
               ) AS "ownerClaimId",
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
        ownerClaimId: expect.any(String),
      });
    const claimedProfile = await readClaimedProfileProof();
    expect(claimedProfile).not.toBeNull();
    const profileId = claimedProfile?.id as string;
    const appUserId = claimedProfile?.appUserId as string;
    const claimId = claimedProfile?.ownerClaimId as string;
    expect(appUserId).toBeTruthy();
    expect(claimId).toBeTruthy();
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
    await captureKeyframe(page, 'dashboard');

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
    // A click that lands before hydration is silently dropped and no import
    // ever starts (intermittent 180s timeouts, 2026-09-26/28). Prove the click
    // registered: the button goes disabled while syncing, or leaves once the
    // catalog exists. The import is idempotent, so a retried click is safe.
    await expect(async () => {
      if (await syncButton.isVisible()) await syncButton.click();
      await expect
        .poll(
          async () =>
            !(await syncButton.isVisible()) || (await syncButton.isDisabled()),
          { timeout: 5_000 }
        )
        .toBe(true);
    }, 'Spotify sync click never registered (button stayed enabled)').toPass({
      timeout: 60_000,
      intervals: [1_000, 2_000, 5_000],
    });

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
    if (process.env.GOLDEN_PATH_KEYFRAME_DIR) {
      await page.goto(APP_ROUTES.RELEASES, {
        waitUntil: 'domcontentloaded',
        timeout: 90_000,
      });
      await captureKeyframe(page, 'releases-imported');
    }

    // Verify the newly created user is visible in the admin dashboard.
    if (hasAdminCredentials()) {
      const adminContext = await browser.newContext();
      const adminPage = await adminContext.newPage();

      try {
        await ensureSignedInUser(adminPage, getAdminCredentials());

        await adminPage.goto(APP_ROUTES.ADMIN_OPS, {
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
    watchKeyframeErrors(fanPage);
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
      if (process.env.GOLDEN_PATH_KEYFRAME_DIR) {
        await captureKeyframe(fanPage, 'release-page');
        await fanPage.goto(`/${uniqueHandle}`, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
        await captureKeyframe(fanPage, 'public-profile');
        const mobileContext = await browser.newContext({
          storageState: { cookies: [], origins: [] },
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
        });
        try {
          const mobilePage = await mobileContext.newPage();
          watchKeyframeErrors(mobilePage);
          await mobilePage.goto(`/${uniqueHandle}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60_000,
          });
          await captureKeyframe(mobilePage, 'public-profile-mobile');
        } finally {
          await mobileContext.close();
        }
      }
    } finally {
      await fanContext.close();
    }

    // Use this admitted identity for the actual Home shell. Controlled Insight
    // presentation does not certify Pro entitlement or a verified success claim.
    await verifyHomeWelcome(page);

    // STEP 9: Reuse this exact identity and context for the post-activation
    // checkout, webhook, fresh-browser return, refund, and revoked-cookie proof.
    await completeGoldenPathBillingJourney({
      appUserId,
      betterAuthUserId,
      browser,
      claimId,
      conversationId: String(conversationId),
      databaseUrl: process.env.DATABASE_URL!,
      email,
      handle: uniqueHandle,
      page,
      profileId,
      spotifyArtistId: TEST_SPOTIFY_ARTIST.id,
    });
  });
});
