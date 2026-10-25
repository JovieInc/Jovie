import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { resolveProductionAuthCredentials } from './utils/production-auth-credentials';
import { waitForProductionDashboardContent } from './utils/production-auth-interaction';
import { signInViaRenderedFlow } from './utils/production-auth-signin';
import {
  buildProductionSignupEmail,
  fillOtpCode,
  syntheticOtpUnavailableReason,
  waitForProductionSignupOtp,
} from './utils/production-signup-canary';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Production dogfood agent, authenticated half (scripts/prod-dogfood.mjs
 * merges the checks file this writes). Signs in as the sanctioned seeded
 * creator-ready production identity through the same rendered flow and OTP
 * source as the post-deploy auth smoke, then walks the dashboard and chat
 * surfaces READ-ONLY: no clicks that mutate, no messages sent.
 *
 * Every page records what a person would notice: page errors, same-origin
 * 4xx/5xx responses (path only, never query values), error text, an empty
 * main, a missing chat composer, plus a screenshot for the vision review.
 * One sign-in only: requesting a second OTP can invalidate the first.
 *
 * @production-dogfood
 */

test.use({ storageState: { cookies: [], origins: [] } });

interface DogfoodCheck {
  readonly id: string;
  readonly target: string;
  readonly status: 'passed' | 'failed' | 'unverified';
  readonly severity?: string;
  readonly summary: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly url?: string;
  readonly screenshot?: string;
  readonly page?: string;
  readonly mission: string;
}

const PAGES = [
  {
    page: 'dashboard-home',
    path: APP_ROUTES.DASHBOARD,
    mission: 'dogfood:dashboard',
  },
  {
    page: 'dashboard-audience',
    path: APP_ROUTES.AUDIENCE,
    mission: 'dogfood:dashboard',
  },
  {
    page: 'dashboard-releases',
    path: APP_ROUTES.RELEASES,
    mission: 'dogfood:dashboard',
  },
  {
    page: 'dashboard-library',
    path: APP_ROUTES.LIBRARY,
    mission: 'dogfood:dashboard',
  },
  {
    page: 'dashboard-earnings',
    path: APP_ROUTES.EARNINGS,
    mission: 'dogfood:dashboard',
  },
  {
    page: 'dashboard-insights',
    path: APP_ROUTES.INSIGHTS,
    mission: 'dogfood:dashboard',
  },
  { page: 'chat', path: APP_ROUTES.CHAT, mission: 'dogfood:chat' },
] as const;

const VIEWPORTS = [
  {
    name: 'desktop',
    width: 1440,
    height: 900,
    pages: PAGES.map(p => p.page) as string[],
  },
  {
    name: 'phone',
    width: 390,
    height: 844,
    pages: ['dashboard-home', 'dashboard-releases', 'chat'],
  },
] as const;

const ERROR_TEXT =
  /application error|something went wrong|internal server error|this page could not be found/i;

function outDir(): string {
  return (
    process.env.DOGFOOD_OUT_DIR ||
    path.resolve('test-results/prod-dogfood-auth')
  );
}

async function inspectPage(
  page: Page,
  spec: (typeof PAGES)[number],
  viewport: { name: string },
  checks: DogfoodCheck[]
): Promise<void> {
  const origin = new URL(page.url()).origin;
  const pageErrors: string[] = [];
  const failed: string[] = [];
  const onError = (e: Error) =>
    pageErrors.push(String(e.message).slice(0, 160));
  const onResponse = (r: { status(): number; url(): string }) => {
    const u = new URL(r.url());
    if (
      r.status() >= 400 &&
      u.origin === origin &&
      !/favicon|_vercel/.test(u.pathname)
    ) {
      failed.push(`${r.status()} ${u.pathname}`);
    }
  };
  page.on('pageerror', onError);
  page.on('response', onResponse);
  const target = `${origin}${spec.path}#${viewport.name}`;
  const base = {
    id: 'dashboard-page-clean',
    target,
    mission: spec.mission,
    page: spec.page,
  };
  try {
    await page.goto(spec.path, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForHydration(page);
    const main = page.locator('main').first();
    await expect(main).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
    const mainText = await waitForProductionDashboardContent(
      page,
      SMOKE_TIMEOUTS.VISIBILITY
    ).catch(() => '');
    await page
      .waitForLoadState('networkidle', { timeout: 10_000 })
      .catch(() => {});
    const problems: string[] = [];
    if (new URL(page.url()).pathname.startsWith('/signin'))
      problems.push('bounced to sign-in while signed in');
    if (pageErrors.length)
      problems.push(`page errors: ${pageErrors.slice(0, 3).join(' | ')}`);
    if (failed.length)
      problems.push(
        `same-origin failures: ${[...new Set(failed)].slice(0, 6).join(', ')}`
      );
    if (ERROR_TEXT.test(mainText)) problems.push('error text visible');
    if (mainText.trim().length < 40)
      problems.push(`main is nearly empty (${mainText.trim().length} chars)`);
    if (spec.page === 'chat') {
      const composer = page
        .locator('textarea, [role="textbox"], [contenteditable="true"]')
        .first();
      const ready = await composer
        .isVisible({ timeout: 10_000 })
        .catch(() => false);
      const enabled = ready && (await composer.isEnabled().catch(() => false));
      if (!ready || !enabled)
        problems.push('chat composer missing or disabled');
    }
    mkdirSync(path.join(outDir(), 'screens'), { recursive: true });
    const shot = path.join('screens', `auth-${spec.page}-${viewport.name}.png`);
    await page.screenshot({ path: path.join(outDir(), shot) });
    const id =
      spec.page === 'chat' ? 'chat-surface-ready' : 'dashboard-page-clean';
    checks.push(
      problems.length
        ? {
            ...base,
            id,
            status: 'failed',
            severity: 'P1',
            summary: `${spec.path} has defects at ${viewport.name} width`,
            expected: 'page renders its content with no errors',
            actual: problems.join('; '),
            url: `${origin}${spec.path}`,
            screenshot: shot,
          }
        : {
            ...base,
            id,
            status: 'passed',
            summary: `${spec.path} clean at ${viewport.name}`,
            screenshot: shot,
          }
    );
  } catch (error) {
    checks.push({
      ...base,
      status: 'failed',
      severity: 'P1',
      summary: `${spec.path} failed to load at ${viewport.name} width`,
      expected: 'page loads',
      actual: String((error as Error).message).split('\n')[0],
      url: `${origin}${spec.path}`,
    });
  } finally {
    page.off('pageerror', onError);
    page.off('response', onResponse);
  }
}

/**
 * Fan subscribe, end to end on the sanctioned synthetic profile (never Tim's).
 * The fan is a plus-addressed synthetic mailbox (`+dogfood-<run>`, the marker
 * synthetic-audience-markers.ts classifies), the OTP is read from the same
 * Cloudflare-routed mailbox the signup canary uses, and the product removes
 * the subscription itself through its own unsubscribe API. If the mailbox
 * secrets are absent the journey is `unverified` and names the missing ones.
 */
async function fanSubscribeJourney(input: {
  readonly browser: Browser;
  readonly owner: Page;
  readonly origin: string;
  readonly checks: DogfoodCheck[];
}): Promise<void> {
  const { browser, owner, origin, checks } = input;
  const mission = 'dogfood:fan-subscribe';
  const target = `${origin}/api/notifications/subscribe`;
  const add = (
    check: Omit<DogfoodCheck, 'mission' | 'target'> & { target?: string }
  ) => checks.push({ mission, target, ...check });
  const baseEmail = process.env.E2E_PROD_SIGNUP_EMAIL_BASE?.trim() ?? '';
  const unavailable =
    (baseEmail ? null : 'E2E_PROD_SIGNUP_EMAIL_BASE is not set') ??
    syntheticOtpUnavailableReason(process.env as never);
  if (!baseEmail || unavailable) {
    add({
      id: 'fan-subscribe-persists',
      status: 'unverified',
      summary: `fan subscribe not run: ${unavailable ?? 'mailbox secrets missing'}`,
    });
    return;
  }

  const profileResponse = await owner
    .context()
    .request.get(`${origin}/api/dashboard/profile`);
  const profile = (
    (await profileResponse.json().catch(() => ({}))) as {
      profile?: { id?: string; username?: string };
    }
  ).profile;
  if (!profile?.id || !profile.username) {
    add({
      id: 'fan-subscribe-persists',
      status: 'unverified',
      summary:
        'owner profile id/handle unavailable from /api/dashboard/profile',
    });
    return;
  }
  const email = buildProductionSignupEmail(
    baseEmail,
    `dogfood-${Date.now().toString(36)}`
  );
  const profileUrl = `${origin}/${profile.username}`;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const fan = await context.newPage();
  const api = (path: string, body: Record<string, unknown>) =>
    context.request.post(`${origin}${path}`, { data: body });
  const status = async () => {
    const r = await api('/api/notifications/status', {
      artist_id: profile.id,
      email,
    });
    return r.ok()
      ? JSON.stringify(await r.json().catch(() => ({})))
      : `HTTP ${r.status()}`;
  };
  let subscribed = false;
  try {
    await fan.goto(profileUrl, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForHydration(fan);
    const flow = fan
      .locator(
        '[data-testid="profile-mobile-notifications-flow"], [role="dialog"]'
      )
      .first();
    if (!(await flow.isVisible({ timeout: 3000 }).catch(() => false))) {
      await fan
        .getByRole('button', { name: /get updates/i })
        .first()
        .click();
    }
    const emailInput = fan
      .getByTestId('mobile-email-input')
      .or(fan.locator('input[type="email"]'))
      .first();
    await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
    const requestedAtMs = Date.now();
    await emailInput.fill(email);
    await fan
      .getByRole('button', { name: /submit|subscribe|get alerts|continue/i })
      .first()
      .click();
    const otpInput = fan
      .locator(
        'input[autocomplete="one-time-code"], input[inputmode="numeric"], input[name="code"]'
      )
      .first();
    await otpInput.waitFor({ state: 'visible', timeout: 20_000 });
    const code = await waitForProductionSignupOtp({
      email,
      env: process.env as never,
      startedAtMs: requestedAtMs,
    });
    const verified = fan.waitForResponse(
      r => r.url().includes('/api/notifications/verify-email-otp'),
      { timeout: 30_000 }
    );
    await fillOtpCode(fan, code);
    const verifyResponse = await verified;
    const persisted = await status();
    subscribed = verifyResponse.ok() && /"email":\s*true/.test(persisted);
    add(
      subscribed
        ? {
            id: 'fan-subscribe-persists',
            status: 'passed',
            summary:
              'synthetic fan subscribed through the rendered flow and the subscription persisted',
            url: profileUrl,
          }
        : {
            id: 'fan-subscribe-persists',
            status: 'failed',
            severity: 'P1',
            summary: 'fan subscribe did not persist',
            expected:
              'verify-email-otp 200 and status shows the email channel subscribed',
            actual: `verify HTTP ${verifyResponse.status()}; status ${persisted.slice(0, 200)}`,
            url: profileUrl,
          }
    );
  } catch (error) {
    const dialogText = await fan
      .locator('[role="dialog"]')
      .first()
      .innerText()
      .catch(() => '');
    add({
      id: 'fan-subscribe-persists',
      status: 'failed',
      severity: 'P2',
      summary:
        'fan subscribe journey broke before the subscription was confirmed',
      expected: 'email, one-time code, subscribed',
      actual: `${String((error as Error).message).split('\n')[0]}; dialog: ${dialogText.replace(/\s+/g, ' ').slice(0, 160)}`,
      url: profileUrl,
    });
  } finally {
    // Cleanup runs even after a partial failure: the product removes the row itself.
    try {
      const gone = await api('/api/notifications/unsubscribe', {
        artist_id: profile.id,
        email,
        channel: 'email',
        method: 'api',
      });
      const after = await status();
      const removed = gone.ok() && !/"email":\s*true/.test(after);
      add(
        removed
          ? {
              id: 'fan-subscribe-cleanup',
              status: 'passed',
              summary:
                'synthetic fan removed through the product unsubscribe API',
            }
          : {
              id: 'fan-subscribe-cleanup',
              status: 'failed',
              severity: 'P1',
              summary:
                'synthetic fan subscription could not be removed through the product',
              expected: 'unsubscribe 200 and status no longer subscribed',
              actual: `unsubscribe HTTP ${gone.status()}; status ${after.slice(0, 200)}; marker +dogfood- is swept by cleanup-synthetic-audience.ts`,
            }
      );
    } catch (error) {
      add({
        id: 'fan-subscribe-cleanup',
        status: 'failed',
        severity: 'P1',
        summary: 'synthetic fan cleanup threw',
        expected: 'removed',
        actual: String((error as Error).message).split('\n')[0],
      });
    }
    await context.close();
  }
}

test.describe('Production dogfood (authenticated) @production-dogfood', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(420_000);

  test('creator-ready dashboard and chat journeys', async ({
    page,
    browser,
  }, testInfo) => {
    const credentials = resolveProductionAuthCredentials();
    test.skip(!credentials, 'No production auth credentials configured');
    const baseUrl = testInfo.project.use.baseURL;
    if (typeof baseUrl !== 'string' || !credentials)
      throw new Error('baseURL and credentials required');
    const origin = new URL(baseUrl).origin;
    const checks: DogfoodCheck[] = [];
    const write = () => {
      mkdirSync(outDir(), { recursive: true });
      writeFileSync(
        path.join(outDir(), 'auth-checks.json'),
        `${JSON.stringify({ origin, checks }, null, 2)}\n`
      );
    };

    let result: string = 'unknown';
    try {
      for (
        let attempt = 0;
        attempt < 2 && result !== 'authenticated';
        attempt += 1
      ) {
        await page.goto(APP_ROUTES.SIGNIN, {
          waitUntil: 'domcontentloaded',
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
        });
        result = await signInViaRenderedFlow(page, credentials, origin);
      }
    } catch (error) {
      // An OTP raced by the post-deploy smoke (same identity) lands here.
      result = `error: ${String((error as Error).message).split('\n')[0]}`;
    }
    if (result !== 'authenticated') {
      for (const m of ['dogfood:dashboard', 'dogfood:chat']) {
        checks.push({
          id: 'auth-signin',
          mission: m,
          target: `${origin}/signin`,
          status: 'unverified',
          summary: `sanctioned sign-in did not complete (${result}); authenticated journeys not verified this run`,
        });
      }
      write();
      return;
    }
    await waitForHydration(page);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      for (const spec of PAGES.filter(p => viewport.pages.includes(p.page))) {
        await inspectPage(page, spec, viewport, checks);
      }
    }
    await fanSubscribeJourney({ browser, owner: page, origin, checks });
    write();
  });
});
