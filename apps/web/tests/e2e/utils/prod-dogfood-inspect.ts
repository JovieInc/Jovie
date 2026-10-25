import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { waitForProductionDashboardContent } from './production-auth-interaction';
import { SMOKE_TIMEOUTS, waitForHydration } from './smoke-test-utils';

/**
 * Shared page inspection for the production dogfood specs (creator and Ovie
 * admin): what a person would notice on a rendered page, plus a screenshot for
 * the vision review. Read-only.
 */

export interface DogfoodCheck {
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

const ERROR_TEXT =
  /application error|something went wrong|internal server error|this page could not be found/i;

export function dogfoodOutDir(): string {
  return (
    process.env.DOGFOOD_OUT_DIR ||
    path.resolve('test-results/prod-dogfood-auth')
  );
}

export async function inspectPage(
  page: Page,
  spec: {
    readonly page: string;
    readonly path: string;
    readonly mission: string;
    /** Check id; defaults to chat-surface-ready for chat, else dashboard-page-clean. */
    readonly checkId?: string;
  },
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
    id: spec.checkId ?? 'dashboard-page-clean',
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
    mkdirSync(path.join(dogfoodOutDir(), 'screens'), { recursive: true });
    const shot = path.join('screens', `auth-${spec.page}-${viewport.name}.png`);
    await page.screenshot({ path: path.join(dogfoodOutDir(), shot) });
    const id =
      spec.checkId ??
      (spec.page === 'chat' ? 'chat-surface-ready' : 'dashboard-page-clean');
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
