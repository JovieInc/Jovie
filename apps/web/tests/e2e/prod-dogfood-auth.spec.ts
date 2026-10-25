import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { resolveProductionAuthCredentials } from './utils/production-auth-credentials';
import { waitForProductionDashboardContent } from './utils/production-auth-interaction';
import { signInViaRenderedFlow } from './utils/production-auth-signin';
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

test.describe('Production dogfood (authenticated) @production-dogfood', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(420_000);

  test('creator-ready dashboard and chat journeys', async ({
    page,
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
    write();
  });
});
