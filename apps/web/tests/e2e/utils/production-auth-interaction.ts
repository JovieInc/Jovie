import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
} from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  isExactNavigationUrl,
  isOriginBoundVercelBypassPrimed,
  isSafePreviewBaseUrl,
  primeOriginBoundVercelBypass,
} from '../../helpers/vercel-preview';

export const EMAIL_FORM_SELECTOR = 'form[data-auth-email-code-step="email"]';
export const IDENTIFIER_INPUT_SELECTOR = [
  'input[name="identifier"]',
  'input[name="emailAddress"]',
  'input[type="email"]',
  'input[autocomplete="email"]',
].join(', ');
export const EMAIL_SUBMIT_BUTTON_SELECTOR = 'button[type="submit"]';
export const CODE_FORM_SELECTOR = 'form[data-auth-email-code-step="code"]';
export const CODE_INPUT_SELECTOR = [
  'input[autocomplete="one-time-code"]',
  'input[inputmode="numeric"]',
  'input[name="code"]',
].join(', ');

export interface ProductionAuthEmailFormControls {
  readonly identifierInput: Locator;
  readonly submitButton: Locator;
}

export interface EnsureProtectedAuthContextOptions {
  readonly bypassSecret?: string;
  readonly expectedDeploymentOrigin?: string;
  readonly baseUrl?: string;
  readonly primeBypassImpl?: (
    context: BrowserContext,
    origin: string
  ) => Promise<void>;
}

const DASHBOARD_MAIN_SELECTOR = 'main';

/**
 * Secondary BrowserContexts opened mid-test (such as `adminInventoryReadback`
 * via `browser.newContext()`) do not inherit the default `context` fixture's
 * origin-bound Vercel Deployment Protection bypass cookie (`_vercel_jwt`).
 * Navigating directly to `/signin` on an unprimed deployment origin serves
 * Vercel's 401 gate instead of `AuthShell`, timing out on
 * `EMAIL_FORM_SELECTOR`. Prime and reload `/signin` once when unprimed.
 */
export async function ensureProtectedAuthContextPrimed(
  page: Page,
  timeoutMs = 15_000,
  options: EnsureProtectedAuthContextOptions = {}
): Promise<boolean> {
  const bypassSecret =
    options.bypassSecret ?? process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET;
  const candidateOrigin =
    options.expectedDeploymentOrigin ??
    process.env.EXPECTED_VERCEL_DEPLOYMENT_ORIGIN ??
    options.baseUrl ??
    process.env.BASE_URL ??
    page.url();

  if (!bypassSecret || !isSafePreviewBaseUrl(candidateOrigin)) {
    return false;
  }

  const context = page.context();
  if (isOriginBoundVercelBypassPrimed(context)) {
    return false;
  }

  const targetOrigin = new URL(candidateOrigin).origin;
  const existingCookies =
    typeof context.cookies === 'function'
      ? await context.cookies(targetOrigin).catch(() => [])
      : [];
  if (existingCookies.some(cookie => cookie.name === '_vercel_jwt')) {
    return false;
  }

  const primeBypass = options.primeBypassImpl ?? primeOriginBoundVercelBypass;
  await primeBypass(context, targetOrigin);

  const currentUrl = page.url();
  const reloadHref = isExactNavigationUrl(currentUrl, targetOrigin)
    ? currentUrl
    : new URL(APP_ROUTES.SIGNIN, targetOrigin).href;
  await page.goto(reloadHref, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  });
  return true;
}

/**
 * The hydration-survival gate needs more patience than the visibility waits.
 * Postdeploy run 43620238651 (2026-11-14) timed out here at 15s on both auth
 * journeys while the same landed deployment (3b902867) hydrated in seconds on
 * the runs before and after it — runner-level contention can stretch React
 * hydration far past the form's first paint. The gate stays fail-closed: a
 * wiped value or a submit that never enables still reds the probe; only its
 * patience grows. An explicit larger caller timeout still wins.
 */
const HYDRATION_SURVIVAL_TIMEOUT_MS = 45_000;

/**
 * Type the email once, as a user does, and require the value to survive
 * hydration. Re-filling after load is banned: it masks the pre-hydration wipe
 * where the controlled input resets and submit stays disabled.
 */
export async function prepareProductionAuthEmailForm(
  page: Page,
  email: string,
  timeoutMs = 15_000,
  bypassOptions?: EnsureProtectedAuthContextOptions
): Promise<ProductionAuthEmailFormControls> {
  await ensureProtectedAuthContextPrimed(page, timeoutMs, bypassOptions);

  const form = page.locator(EMAIL_FORM_SELECTOR).first();
  await form.waitFor({ state: 'visible', timeout: timeoutMs });

  const identifierInput = form.locator(IDENTIFIER_INPUT_SELECTOR).first();
  const submitButton = form.locator(EMAIL_SUBMIT_BUTTON_SELECTOR).first();
  await identifierInput.waitFor({ state: 'visible', timeout: timeoutMs });
  await submitButton.waitFor({ state: 'visible', timeout: timeoutMs });

  // Real user path: type once, with real keystrokes, the moment the field is
  // visible. Never re-type after hydration, because that hides the
  // pre-hydration wipe (prod /signin 2026-10-18 and 2026-10-20, PR #22321).
  await identifierInput.click();
  await identifierInput.pressSequentially(email);
  await page.waitForLoadState('load', { timeout: timeoutMs });

  // The typed value must survive hydration and enable submit on its own.
  await page.waitForFunction(
    ({ selector, inputSelector, expected }) => {
      const input = document.querySelector(
        inputSelector
          .split(', ')
          .map(part => `${selector} ${part}`)
          .join(', ')
      );
      const button = document.querySelector(
        `${selector} button[type="submit"]`
      );
      return (
        input instanceof HTMLInputElement &&
        input.value === expected &&
        button instanceof HTMLButtonElement &&
        !button.disabled
      );
    },
    {
      selector: EMAIL_FORM_SELECTOR,
      inputSelector: IDENTIFIER_INPUT_SELECTOR,
      expected: email,
    },
    { timeout: Math.max(timeoutMs, HYDRATION_SURVIVAL_TIMEOUT_MS) }
  );
  await expect(identifierInput).toHaveValue(email);

  return { identifierInput, submitButton };
}

/**
 * Wait for the authenticated dashboard to render meaningful content.
 * The app shell can expose a visible, temporarily empty <main> while the
 * redirected React Server Component payload is still settling.
 */
export async function waitForProductionDashboardContent(
  page: Page,
  timeoutMs = 15_000,
  minLength = 30
): Promise<string> {
  const contentHandle = await page.waitForFunction(
    ({ selector, minimumLength }) => {
      const main = document.querySelector(selector);
      if (!(main instanceof HTMLElement)) return false;

      const text = (main.innerText || main.textContent || '').trim();
      return text.length > minimumLength ? text : false;
    },
    { selector: DASHBOARD_MAIN_SELECTOR, minimumLength: minLength },
    { timeout: timeoutMs }
  );

  return contentHandle.jsonValue() as Promise<string>;
}

/**
 * Settings > Billing mounts its heading client-side, so `main` is empty at
 * DOMContentLoaded and right after the generic hydration wait. Poll for the
 * first meaningful text instead of sampling `innerText` once (the 2026-10-29
 * 05:06Z promotion failed on exactly that single sample returning "").
 */
export async function waitForCheckoutEntryContent(
  page: Page,
  timeoutMs = 15_000
): Promise<string> {
  const text = await waitForProductionDashboardContent(page, timeoutMs, 5);
  return text.toLowerCase();
}

/** Wait through the fresh-user redirect chain without starting another navigation. */
export async function waitForProductionOnboardingLanding(
  page: Page,
  expectedOrigin: string,
  timeoutMs = 30_000
): Promise<void> {
  const landing = await page.waitForFunction(
    ({ origin, pathname, shellSelector, inputSelector }) => {
      if (location.origin !== origin || location.pathname !== pathname)
        return false;
      const shell = document.querySelector(shellSelector);
      const input = shell?.querySelector(inputSelector);
      if (
        !(shell instanceof HTMLElement) ||
        !(
          input instanceof HTMLTextAreaElement ||
          input instanceof HTMLInputElement
        )
      )
        return false;
      const visible = (element: HTMLElement) => {
        const style = getComputedStyle(element);
        return (
          element.getClientRects().length > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.visibility !== 'collapse'
        );
      };
      return (
        visible(shell) &&
        visible(input) &&
        !input.matches(':disabled') &&
        !input.readOnly
      );
    },
    {
      origin: expectedOrigin,
      pathname: APP_ROUTES.START,
      shellSelector: '[data-testid="onboarding-chat"]',
      inputSelector: '[aria-label="Chat message input" i]',
    },
    { timeout: timeoutMs }
  );
  await landing.dispose();
}
