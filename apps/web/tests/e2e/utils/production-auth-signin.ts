import { expect, type Page } from '@playwright/test';
import {
  assertExactNavigationUrl,
  isExactNavigationUrl,
} from '../../helpers/vercel-preview';
import type { ProductionAuthCredentials } from './production-auth-credentials';
import { prepareProductionAuthEmailForm } from './production-auth-interaction';
import { waitForProductionAuthOtp } from './production-auth-otp';
import { SMOKE_TIMEOUTS } from './smoke-test-utils';

/**
 * Rendered production sign-in shared by the post-deploy auth smoke and the
 * production dogfood agent: type the email once, answer the email-code step
 * from the production OTP source, land on /app.
 */
export type SignInResult =
  | 'authenticated'
  | 'verification-required'
  | 'signin-form-unavailable'
  | 'unknown';

type SignInNextStep = 'redirected' | 'password' | 'email_code' | 'unknown';

async function detectNextStep(
  page: Page,
  expectedOrigin: string
): Promise<SignInNextStep> {
  return page
    .waitForFunction(
      exactOrigin => {
        if (window.location.origin !== exactOrigin) return false;
        if (window.location.pathname.startsWith('/app')) return 'redirected';
        if (
          document.querySelector(
            'input[name="password"], input[type="password"]'
          )
        ) {
          return 'password';
        }
        if (
          document.querySelector('[data-auth-email-code-step="code"]') ||
          document.querySelector(
            'input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]'
          )
        ) {
          return 'email_code';
        }
        return false;
      },
      expectedOrigin,
      { timeout: 15_000 }
    )
    .then(handle => handle.jsonValue() as Promise<SignInNextStep>)
    .catch(() => 'unknown');
}

export async function signInViaRenderedFlow(
  page: Page,
  credentials: ProductionAuthCredentials,
  expectedOrigin: string
): Promise<SignInResult> {
  assertExactNavigationUrl(page.url(), expectedOrigin, 'Rendered sign-in flow');
  let emailForm = page
    .locator('form[data-auth-email-code-step="email"]')
    .first();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const hasIdentifierInput = await emailForm
      .isVisible({ timeout: 15_000 })
      .catch(() => false);
    if (hasIdentifierInput) break;
    if (
      isExactNavigationUrl(page.url(), expectedOrigin) &&
      new URL(page.url()).pathname.startsWith('/app')
    ) {
      return 'authenticated';
    }
    if (attempt === 0) {
      await page.reload({
        waitUntil: 'domcontentloaded',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      assertExactNavigationUrl(
        page.url(),
        expectedOrigin,
        'Rendered sign-in reload'
      );
      emailForm = page
        .locator('form[data-auth-email-code-step="email"]')
        .first();
    } else {
      return 'signin-form-unavailable';
    }
  }

  const { submitButton } = await prepareProductionAuthEmailForm(
    page,
    credentials.email
  );
  const otpRequestedAtMs = Date.now();
  await submitButton.click();

  const nextStep = await detectNextStep(page, expectedOrigin);

  if (nextStep === 'redirected') {
    return 'authenticated';
  }

  if (nextStep === 'password') {
    const passwordInput = page
      .locator('input[name="password"], input[type="password"]')
      .first();
    await expect(passwordInput).toBeVisible({ timeout: 10_000 });
    await passwordInput.fill(credentials.password);
    await page
      .locator('form:has(input[type="password"]) button[type="submit"]')
      .first()
      .click();
    await page.waitForURL(
      url => url.origin === expectedOrigin && url.pathname.startsWith('/app'),
      { timeout: 30_000 }
    );
    assertExactNavigationUrl(page.url(), expectedOrigin, 'Password redirect');
    return 'authenticated';
  }

  if (nextStep === 'email_code') {
    const codeForm = page
      .locator('form[data-auth-email-code-step="code"]')
      .first();
    const codeInput = codeForm
      .locator(
        '[data-testid="otp-autofill-input"], input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]'
      )
      .first();
    await expect(codeInput).toBeVisible({ timeout: 10_000 });
    const verificationCode =
      credentials.verificationCode ||
      (await waitForProductionAuthOtp({
        email: credentials.email,
        startedAtMs: otpRequestedAtMs,
      }));
    const authenticatedRedirect = page.waitForURL(
      url => url.origin === expectedOrigin && url.pathname.startsWith('/app'),
      { timeout: 30_000 }
    );
    await codeInput.fill(verificationCode);
    await authenticatedRedirect;
    assertExactNavigationUrl(page.url(), expectedOrigin, 'Email-code redirect');
    return 'authenticated';
  }

  return 'unknown';
}
