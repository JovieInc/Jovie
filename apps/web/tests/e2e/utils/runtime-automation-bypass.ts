import type { BrowserContext } from '@playwright/test';

export const ONBOARDING_SESSION_COOKIE_NAME = 'jovie_onboarding_session';

/**
 * Mark one browser document as local E2E automation as soon as its root exists.
 *
 * Playwright init scripts can run before the parser creates `documentElement`, so
 * the bootstrap must defer the write instead of assuming an HTML root exists.
 * Keep this function self-contained: Playwright serializes it into the browser.
 */
export function installRuntimeAutomationBypass(): void {
  const initialRoot = document.documentElement;
  if (initialRoot) {
    initialRoot.dataset.e2eMode = '1';
    return;
  }

  const observer = new MutationObserver(() => {
    const root = document.documentElement;
    if (!root) return;

    root.dataset.e2eMode = '1';
    observer.disconnect();
  });
  observer.observe(document, { childList: true });
}

/** Clear auth state between signup attempts without losing the anonymous journey. */
export async function resetAuthStatePreservingOnboardingSession(
  context: BrowserContext
): Promise<void> {
  const onboardingCookies = (await context.cookies()).filter(
    cookie => cookie.name === ONBOARDING_SESSION_COOKIE_NAME
  );

  await context.clearCookies();
  if (onboardingCookies.length > 0) {
    await context.addCookies(onboardingCookies);
  }
}
