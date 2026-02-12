import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test as setup } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

const AUTH_FILE = 'tests/.auth/user.json';

setup.describe.configure({ mode: 'serial' });

setup.setTimeout(240_000); // 4min to handle Turbopack cold-start compilation

setup('authenticate', async ({ page, baseURL }) => {
  const username = process.env.E2E_CLERK_USER_USERNAME;
  const password = process.env.E2E_CLERK_USER_PASSWORD;

  // Guard: write empty auth state if prerequisites missing
  if (!username || process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
    console.log('  Auth prerequisites not met, writing empty auth state');
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  // 1. Set up testing token BEFORE navigation
  await setupClerkTestingToken({ page });

  // 2. Navigate to sign-in page (has ClerkProvider)
  // Turbopack cold compilation can cause the first navigation to hang even after
  // warmup in global-setup. Retry with fresh navigations to recover.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(APP_ROUTES.SIGNIN, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      break; // Navigation succeeded
    } catch {
      if (attempt === 3)
        throw new Error('Failed to load /signin after 3 attempts');
      console.log(`  /signin attempt ${attempt} timed out, retrying...`);
    }
  }

  // 3. Turbopack buffer — absorb compilation time before Clerk's 30s timer starts
  // Phase 1: Wait for page to be fully compiled and interactive
  await page.waitForFunction(() => document.readyState === 'complete', {
    timeout: 120_000,
  });
  // Phase 2: Wait for Clerk JS to load from CDN (mandatory — not silently caught)
  await page.waitForFunction(() => !!(window as any).Clerk?.loaded, {
    timeout: 60_000,
  });

  // 4. Sign in using appropriate strategy
  // Wrap in try/catch to handle "already signed in" from testing token
  try {
    if (username.includes('+clerk_test')) {
      await clerk.signIn({
        page,
        signInParams: { strategy: 'email_code', identifier: username },
      });
    } else if (password) {
      await clerk.signIn({
        page,
        signInParams: { strategy: 'password', identifier: username, password },
      });
    } else {
      await page.context().storageState({ path: AUTH_FILE });
      return;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('already signed in')) {
      console.log('  Already signed in via testing token, continuing...');
    } else {
      throw error;
    }
  }

  // 5. Navigate to dashboard profile to verify auth + warm up route
  // Use DASHBOARD_PROFILE instead of DASHBOARD (which redirects to chat)
  // Use 'domcontentloaded' to avoid Sentry blocking 'load'/'networkidle'
  await page.goto(APP_ROUTES.DASHBOARD_PROFILE, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });

  // 6. Wait for dashboard to be usable, dismissing Next.js dev error overlays
  // Turbopack cold compilation + hydration mismatch (nonce attr) can block the page.
  // Strategy: dismiss overlays, reload once if the page is stuck.
  let hasReloaded = false;
  await expect(async () => {
    // Dismiss Next.js error overlay if present
    const overlay = page.locator(
      '[data-nextjs-dialog-overlay], [data-nextjs-toast]'
    );
    if (await overlay.isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    // Click "Try again" on error boundary if present
    const tryAgain = page.locator('button:has-text("Try again")');
    if (await tryAgain.isVisible({ timeout: 500 }).catch(() => false)) {
      await tryAgain.click();
      await page.waitForTimeout(1000);
    }
    // If nav still not visible and we haven't reloaded, try a full page reload
    // This reliably recovers from stuck error overlays and Turbopack issues
    const dashNav = page.locator('nav[aria-label="Dashboard navigation"]');
    if (!(await dashNav.isVisible().catch(() => false)) && !hasReloaded) {
      hasReloaded = true;
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    }
    await expect(dashNav).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 120_000, intervals: [3000, 5000, 10000, 15000] });

  // 7. Save authenticated session
  await page.context().storageState({ path: AUTH_FILE });
  console.log(`  Session saved to ${AUTH_FILE}`);
});
