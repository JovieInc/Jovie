import { createClerkClient } from '@clerk/backend';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

/**
 * Real authenticated-session monitor (@production-smoke).
 *
 * The synthetic checks (render / redirect / keys) prove the sign-in *surface* is
 * up; this proves a real Clerk session actually authenticates and lands in the
 * app on the LIVE instance — catching session-creation / JWT / proxy-state /
 * post-auth-redirect regressions (e.g. JOV-3087) that a render check can't.
 *
 * It can't use the real OTP/password UI (live instances are email-code only and
 * OTP can't be automated without a mailbox — tracked in JOV-3582). Instead it
 * mints a Clerk `sign_in_token` via the Backend API for a dedicated monitor user
 * and exchanges it through Clerk JS (signIn.create strategy:'ticket' + setActive)
 * in a real browser. No credential is stored; only CLERK_SECRET_KEY (already a
 * prod secret) is needed.
 *
 * Provision the monitor user once: apps/web/scripts/setup-prod-auth-monitor.ts
 */

test.use({ storageState: { cookies: [], origins: [] } });

const EMAIL = process.env.AUTH_MONITOR_EMAIL || 'auth-monitor@jov.ie';

test.describe('Real authenticated session @production-smoke', () => {
  test.setTimeout(90_000);

  test('sign_in_token exchange creates an authenticated session', async ({
    page,
  }) => {
    const secretKey = process.env.CLERK_SECRET_KEY;
    test.skip(
      !secretKey,
      'CLERK_SECRET_KEY not set — real-session monitor needs the instance secret key'
    );

    const clerk = createClerkClient({ secretKey });
    const users = await clerk.users.getUserList({ emailAddress: [EMAIL] });
    test.skip(
      users.totalCount === 0,
      `auth monitor user ${EMAIL} not provisioned — run setup-prod-auth-monitor.ts`
    );
    const userId = users.data[0].id;

    const tokenRes = await clerk.signInTokens.createSignInToken({
      userId,
      expiresInSeconds: 300,
    });
    const ticket = tokenRes.token;

    // Clerk's invisible bot-protection otherwise leaves the sign-in page stuck
    // at "Loading sign-in options" in a headless/CI browser. The testing token
    // bypasses it (the same way the E2E suite does) so Clerk JS reaches `loaded`.
    await setupClerkTestingToken({ page });

    // Jovie uses a CUSTOM sign-in flow (not Clerk's drop-in <SignIn>), so the
    // __clerk_ticket URL param is ignored. Exchange the ticket via Clerk JS the
    // way the app itself would, then assert a real session exists.
    await page.goto(`${process.env.BASE_URL}/signin`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForFunction(
      () => Boolean((window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded),
      undefined,
      { timeout: 45_000 }
    );

    const result = await page.evaluate(async ticketValue => {
      const clerkJs = (
        window as unknown as {
          Clerk: {
            client: {
              signIn: {
                create: (p: { strategy: string; ticket: string }) => Promise<{
                  status: string;
                  createdSessionId: string | null;
                }>;
              };
            };
            setActive: (p: { session: string }) => Promise<void>;
            user?: { id: string } | null;
          };
        }
      ).Clerk;
      const si = await clerkJs.client.signIn.create({
        strategy: 'ticket',
        ticket: ticketValue,
      });
      if (si.status !== 'complete' || !si.createdSessionId) {
        return { ok: false, status: si.status };
      }
      await clerkJs.setActive({ session: si.createdSessionId });
      return { ok: true, status: si.status, userId: clerkJs.user?.id ?? null };
    }, ticket);

    expect(
      result.ok,
      `Clerk ticket exchange did not complete (status=${result.status})`
    ).toBe(true);
    expect(result.userId, 'No authenticated Clerk user after exchange').toBe(
      userId
    );

    // And the session is real end-to-end: an authed route does not bounce to /signin.
    await page.goto(`${process.env.BASE_URL}/app`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForLoadState('networkidle').catch(() => {});
    const landedPath = new URL(page.url()).pathname;
    expect(
      landedPath,
      `Authenticated /app navigation bounced to ${landedPath}`
    ).not.toMatch(/^\/(signin|sign-in)/);

    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toMatch(
      /authentication unavailable|temporarily unavailable|service is initializing|application error|something went wrong/
    );
  });
});
