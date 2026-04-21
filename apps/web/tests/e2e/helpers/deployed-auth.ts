import { expect, type Page } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

export interface RenderedAuthCredentials {
  readonly email: string;
  readonly password: string;
  readonly verificationCode?: string;
}

export type SignInResult =
  | 'authenticated'
  | 'verification-required'
  | 'signin-form-unavailable'
  | 'unknown';

type SignInNextStep = 'redirected' | 'password' | 'email_code' | 'unknown';

export async function waitForClerk(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => !!(window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded,
      undefined,
      { timeout: 30_000 }
    )
    .catch(() => {
      // Clerk may not be available in all environments.
    });
}

async function getIdentifierInput(page: Page) {
  return page
    .locator(
      'input[name="identifier"], input[type="email"], input[autocomplete="email"]'
    )
    .first();
}

async function getSubmitButton(page: Page) {
  return page
    .locator(
      [
        'button[type="submit"]',
        'button:has-text("Continue")',
        'button:has-text("Sign in")',
        'button:has-text("Verify")',
      ].join(', ')
    )
    .first();
}

async function detectNextStep(page: Page): Promise<SignInNextStep> {
  return page
    .waitForFunction(
      () => {
        if (window.location.pathname.startsWith('/app')) return 'redirected';
        if (
          document.querySelector(
            'input[name="password"], input[type="password"]'
          )
        ) {
          return 'password';
        }
        if (
          document.querySelector(
            'input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]'
          )
        ) {
          return 'email_code';
        }
        return false;
      },
      undefined,
      { timeout: 15_000 }
    )
    .then(handle => handle.jsonValue() as Promise<SignInNextStep>)
    .catch(() => 'unknown');
}

export async function signInViaRenderedFlow(
  page: Page,
  credentials: RenderedAuthCredentials
): Promise<SignInResult> {
  const identifierInput = await getIdentifierInput(page);
  const hasIdentifierInput = await identifierInput
    .isVisible({ timeout: 15_000 })
    .catch(() => false);

  if (!hasIdentifierInput) {
    if (page.url().includes('/app')) {
      return 'authenticated';
    }
    return 'signin-form-unavailable';
  }

  await identifierInput.fill(credentials.email);
  await (await getSubmitButton(page)).click();

  const nextStep = await detectNextStep(page);

  if (nextStep === 'redirected') {
    return 'authenticated';
  }

  if (nextStep === 'password') {
    const passwordInput = page
      .locator('input[name="password"], input[type="password"]')
      .first();
    await expect(passwordInput).toBeVisible({ timeout: 10_000 });
    await passwordInput.fill(credentials.password);
    await (await getSubmitButton(page)).click();
    await page.waitForURL(url => url.pathname.startsWith('/app'), {
      timeout: 30_000,
    });
    return 'authenticated';
  }

  if (nextStep === 'email_code') {
    if (!credentials.verificationCode) {
      return 'verification-required';
    }

    const codeInput = page
      .locator(
        'input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]'
      )
      .first();
    await expect(codeInput).toBeVisible({ timeout: 10_000 });
    await codeInput.fill(credentials.verificationCode);
    await (await getSubmitButton(page)).click();
    await page.waitForURL(url => url.pathname.startsWith('/app'), {
      timeout: 30_000,
    });
    return 'authenticated';
  }

  return 'unknown';
}

export async function openPublicProfileFromDashboard(
  page: Page
): Promise<Page> {
  await page.goto(APP_ROUTES.DASHBOARD_PROFILE, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  const openProfileButton = page.getByRole('button', {
    name: /open public profile/i,
  });
  await expect(openProfileButton).toBeVisible({ timeout: 20_000 });

  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 20_000 }),
    openProfileButton.click(),
  ]);

  await popup.waitForLoadState('domcontentloaded');
  return popup;
}
