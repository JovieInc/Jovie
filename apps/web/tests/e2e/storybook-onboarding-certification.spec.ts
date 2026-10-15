import { readFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Read the budget without importing the Node ESM producer into Playwright's CJS loader.
const gateSource = readFileSync(
  path.resolve(
    __dirname,
    '../../../../scripts/invariants/screen-certification.mjs'
  ),
  'utf8'
);
const budget = gateSource.match(
  /export const CLS_INTERACTION_BUDGET = ([\d.]+);/
);
if (!budget) throw new Error('Screen certification CLS budget is missing');
const CLS_INTERACTION_BUDGET = Number(budget[1]);

// Component evidence uses the screen gate's budget. Hosted route certification
// still requires its trusted exact-head producer; these stories cannot mint it.
const groups = {
  onboardingtoolartifacts: {
    searching: 'Looking for the right Spotify artist',
    'search-failed': 'Spotify search did not load',
    'picker-empty': 'Start with the artist name',
    'picker-results': 'Story Artist',
    'picker-disabled': 'Story Artist',
    'picker-no-results': 'No exact match yet',
    'picker-search-error': 'Retry',
    'picker-query-loading': 'Searching Spotify',
    'picker-none-of-these': 'Story Artist',
    'artist-loading': 'Pulling the Spotify profile',
    'artist-error': 'Artist profile could not be loaded',
    'artist-confirmed': '',
    'handle-loading': 'Checking the handle',
    'handle-error': 'Handle check failed',
    'handle-available': 'is available',
    'handle-taken': 'is not available',
    'handle-unavailable': 'Check unavailable',
    'handle-disabled': 'is available',
    'handle-confirmed': 'Handle confirmed',
    'social-loading': 'Reading the link',
    'social-error': 'Link could not be prepared',
    'social-empty': 'Attach Account',
    'social-valid': 'Attach Account',
    'social-invalid': 'Add the account path',
    'social-disabled': 'Attach Account',
    'social-attached': 'Social account attached',
  },
  chatproposenextstepcard: {
    'instant-access': 'Add an email',
    'instant-access-signed-in': 'already signed in',
    'instant-access-auth-unavailable': 'Create your account',
    waitlist: 'Save your spot',
    'waitlist-signed-in': 'Saving your request',
    'waitlist-signed-out': 'Save your spot',
    'waitlist-auth-unavailable': 'Save your spot',
    'needs-more-info': '',
  },
  chatproposecheckoutcard: {
    pro: 'Continue to checkout',
    free: 'Continue to checkout',
    max: 'Continue to checkout',
    'no-plan-chosen': 'Pick a plan',
    'fallback-route': 'Pick a plan',
  },
};

type ProofWindow = Window & { __onboardingCls?: number };

for (const viewport of [
  { id: 'desktop', width: 1280 },
  { id: 'mobile', width: 390 },
]) {
  for (const [group, states] of Object.entries(groups)) {
    for (const [state, expected] of Object.entries(states)) {
      test(`${group}/${state} ${viewport.id}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: viewport.width, height: 900 });
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => {
          (window as ProofWindow).__onboardingCls = 0;
          new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
              const shift = entry as PerformanceEntry & {
                value: number;
                hadRecentInput: boolean;
              };
              if (!shift.hadRecentInput)
                (window as ProofWindow).__onboardingCls =
                  ((window as ProofWindow).__onboardingCls ?? 0) + shift.value;
            }
          }).observe({ type: 'layout-shift', buffered: true });
        });
        await page.goto(
          `/iframe.html?id=features-onboarding-${group}--${state}&viewMode=story`
        );
        const root = page.locator('#storybook-root');
        await expect(page.locator('body')).toHaveClass(/sb-show-main/);
        if (expected) await expect(root).toContainText(expected);
        else await expect(root).toBeEmpty();
        await page.evaluate(() => document.fonts.ready);
        const input = root.getByRole('textbox').first();
        if ((await input.count()) && (await input.isEnabled())) {
          await input.focus();
          await expect(input).toBeFocused();
          const before = await input.boundingBox();
          const value = await input.inputValue();
          await page.keyboard.press('End');
          await page.keyboard.type('x');
          await expect(input).toHaveValue(`${value}x`);
          const after = await input.boundingBox();
          expect(after?.x).toBe(before?.x);
          expect(after?.y).toBe(before?.y);
        }
        const link = root.getByRole('link', { name: 'Continue', exact: true });
        if (await link.count()) {
          await link.focus();
          await expect(link).toBeFocused();
          await expect(link).toHaveAttribute(
            'href',
            /^\/onboarding\/checkout(?:\?|$)/
          );
          await link.click({ trial: true });
        }
        const metrics = await page.evaluate(() => ({
          cls: (window as ProofWindow).__onboardingCls ?? 0,
          overflow: Math.max(
            0,
            document.documentElement.scrollWidth - innerWidth
          ),
        }));
        expect(metrics.cls).toBeLessThanOrEqual(CLS_INTERACTION_BUDGET);
        expect(metrics.overflow).toBeLessThanOrEqual(1);
        const axe = await new AxeBuilder({ page })
          .include('#storybook-root')
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze();
        expect(axe.violations).toEqual([]);
        expect(errors).toEqual([]);
        await testInfo.attach('component-measurements', {
          body: JSON.stringify({
            ...metrics,
            interaction: { passed: true },
            axe: { violations: axe.violations.length },
          }),
          contentType: 'application/json',
        });
        await testInfo.attach('rendered-state', {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
      });
    }
  }
}
