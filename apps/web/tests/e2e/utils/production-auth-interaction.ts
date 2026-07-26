import type { Locator, Page } from '@playwright/test';

const EMAIL_FORM_SELECTOR = 'form[data-auth-email-code-step="email"]';
const IDENTIFIER_INPUT_SELECTOR = [
  'input[name="identifier"]',
  'input[name="emailAddress"]',
  'input[type="email"]',
  'input[autocomplete="email"]',
].join(', ');

export interface ProductionAuthEmailFormControls {
  readonly identifierInput: Locator;
  readonly submitButton: Locator;
}

const DASHBOARD_MAIN_SELECTOR = 'main';

/**
 * Wait for the production auth page to be interactive before mutating its
 * controlled email input. Filling at `domcontentloaded` can race React
 * hydration: the DOM value changes, but the component state stays empty and
 * the submit button remains disabled.
 */
export async function prepareProductionAuthEmailForm(
  page: Page,
  email: string,
  timeoutMs = 15_000
): Promise<ProductionAuthEmailFormControls> {
  await page.waitForLoadState('load', { timeout: timeoutMs });

  const form = page.locator(EMAIL_FORM_SELECTOR).first();
  await form.waitFor({ state: 'visible', timeout: timeoutMs });

  const identifierInput = form.locator(IDENTIFIER_INPUT_SELECTOR).first();
  const submitButton = form.locator('button[type="submit"]').first();
  await identifierInput.waitFor({ state: 'visible', timeout: timeoutMs });
  await submitButton.waitFor({ state: 'visible', timeout: timeoutMs });

  // Reapply the controlled value only after the load/hydration boundary.
  await identifierInput.fill('');
  await identifierInput.fill(email);
  await page.waitForFunction(
    selector => {
      const button = document.querySelector(
        `${selector} button[type="submit"]`
      );
      return button instanceof HTMLButtonElement && !button.disabled;
    },
    EMAIL_FORM_SELECTOR,
    { timeout: timeoutMs }
  );

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
