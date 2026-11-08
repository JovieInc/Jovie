'use client';

import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Post-auth shell-readiness wait and its stall diagnostics.
 *
 * Extracted from helpers/auth.ts to keep that file under its company-guards
 * size-500 pin; the behavior is byte-identical to the version that landed in
 * #24389 (JOV-7653 login-timeout diagnostics).
 */

/**
 * Diagnostic-only: describe the exact stuck state when the post-auth shell
 * never becomes ready, so the nightly annotation distinguishes a failed
 * restore (Try Again), an eternally-restoring boundary, and a landing that
 * never reached /start or /app. Reads only; changes nothing.
 */
export async function describeShellReadyStall(
  page: Page,
  main: Locator,
  chatComposer: Locator
): Promise<string> {
  const bits: string[] = [`url=${page.url()}`];
  const boundary = page
    .locator('[data-testid="onboarding-session-boundary"]')
    .first();
  const readAttr = async (name: string) =>
    boundary.getAttribute(name).catch(() => null);
  const [restoreState, restoreError, authState] = await Promise.all([
    readAttr('data-restore-state'),
    readAttr('data-restore-error'),
    readAttr('data-auth-state'),
  ]);
  bits.push(
    `main=${await main.isVisible().catch(() => 'unknown')}`,
    `composer=${await chatComposer.isVisible().catch(() => 'unknown')}`,
    `boundary-restore-state=${restoreState ?? 'absent'}`,
    `boundary-restore-error=${restoreError ?? 'absent'}`,
    `boundary-auth-state=${authState ?? 'absent'}`
  );
  const bodyText = await page
    .locator('body')
    .innerText({ timeout: 5_000 })
    .catch(() => '');
  if (bodyText) {
    bits.push(`body=${bodyText.replace(/\s+/g, ' ').slice(0, 240)}`);
  }
  return bits.join(' | ');
}

export async function waitForShellReadyAfterAuth(page: Page): Promise<void> {
  const main = page.locator('main').first();
  const chatComposer = page
    .locator('textarea, [contenteditable="true"], a[href="/app/chat"]')
    .first();
  const isShellReady = async () =>
    (await main.isVisible().catch(() => false)) ||
    (await chatComposer.isVisible().catch(() => false));

  // The `creator` persona keeps onboarding incomplete by design, so the
  // post-bypass landing can be /start instead of /app. There, the
  // OnboardingSessionBoundary (JOV-7689) mounts the shell only after a
  // client-side conversation restore resolves; a failed restore leaves a
  // static Try Again state with no <main>/composer — a reload is the same
  // recovery the surface itself offers. Retry the navigation once mid-poll:
  // /app states always render <main> (shell skeleton included), so the
  // reload can only fire on a stuck /start boundary.
  const reloaded = { value: false };

  // Diagnostic-only: on a poll timeout, name the exact stuck state so the
  // nightly annotation distinguishes a failed restore (Try Again), an
  // eternally-restoring boundary, and a landing that never reached /start or
  // /app. The pass conditions and budgets are unchanged.
  const describeStall = () => describeShellReadyStall(page, main, chatComposer);

  try {
    await expect
      .poll(
        async () => {
          if (await isShellReady()) return true;
          if (!reloaded.value) {
            const url = new URL(page.url());
            if (url.pathname.startsWith('/start')) {
              reloaded.value = true;
              await page
                .reload({ waitUntil: 'domcontentloaded', timeout: 45_000 })
                .catch(() => undefined);
            }
          }
          return false;
        },
        { timeout: 90_000, intervals: [2_000, 5_000, 10_000] }
      )
      .toBe(true);
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} | ${await describeStall()}`
    );
  }
}
