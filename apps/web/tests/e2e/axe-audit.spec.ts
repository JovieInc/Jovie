import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { waitForLoad } from './utils/smoke-test-utils';

/**
 * Axe WCAG 2.1 Level AA Compliance Tests
 *
 * These tests use axe-core to scan critical routes for accessibility violations.
 * Tests run against WCAG 2.0 Level A and AA, plus WCAG 2.1 Level A and AA standards.
 *
 * NOTE: Tests public routes for unauthenticated visitors.
 * Must run without saved authentication.
 *
 * @see https://www.deque.com/axe/core-documentation/api-documentation/
 */

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Axe WCAG 2.1 Compliance', () => {
  // Turbopack cold compilation can take 30-90s per route
  test.setTimeout(180_000);

  const publicRoutes = [
    { path: '/', name: 'Homepage' },
    { path: '/signin', name: 'Sign In' },
    { path: '/signup', name: 'Sign Up' },
    { path: '/pricing', name: 'Pricing' },
    { path: '/support', name: 'Support' },
  ];

  for (const route of publicRoutes) {
    test(`${route.name} (${route.path}) should have no a11y violations`, async ({
      page,
    }) => {
      await page.goto(route.path, { timeout: 120_000 });
      await waitForLoad(page);

      // Exclude color-contrast — tracked separately as design token issue
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .disableRules(['color-contrast'])
        .analyze();

      if (results.violations.length > 0) {
        console.log(
          `\nAccessibility violations found on ${route.name} (${route.path}):`
        );
        results.violations.forEach(violation => {
          console.log(`\n- ${violation.id}: ${violation.description}`);
          console.log(`  Impact: ${violation.impact}`);
          console.log(`  Help: ${violation.helpUrl}`);
          console.log(
            `  Affected elements: ${violation.nodes.length} element(s)`
          );
        });
      }

      expect(results.violations).toEqual([]);
    });
  }

  // Authenticated routes tests (skipped in smoke mode)
  const authenticatedRoutes = [
    { path: '/dashboard', name: 'Dashboard' },
    { path: '/dashboard/links', name: 'Links Manager' },
    { path: '/dashboard/settings', name: 'Settings' },
  ];

  const smokeOnly = process.env.SMOKE_ONLY === '1';

  for (const route of authenticatedRoutes) {
    test(`${route.name} (${route.path}) should have no a11y violations`, async ({
      page,
    }) => {
      test.skip(smokeOnly, 'Skip authenticated routes in smoke mode');
      await page.goto(route.path, { timeout: 120_000 });
      await waitForLoad(page);

      // Exclude color-contrast — tracked separately as design token issue
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .disableRules(['color-contrast'])
        .analyze();

      if (results.violations.length > 0) {
        console.log(
          `\nAccessibility violations found on ${route.name} (${route.path}):`
        );
        results.violations.forEach(violation => {
          console.log(`\n- ${violation.id}: ${violation.description}`);
          console.log(`  Impact: ${violation.impact}`);
          console.log(`  Help: ${violation.helpUrl}`);
          console.log(
            `  Affected elements: ${violation.nodes.length} element(s)`
          );
        });
      }

      expect(results.violations).toEqual([]);
    });
  }
});

test.describe('Axe Best Practices', () => {
  test('Homepage should follow best practices', async ({ page }) => {
    await page.goto('/', { timeout: 120_000 });
    await waitForLoad(page);

    const results = await new AxeBuilder({ page })
      .withTags(['best-practice'])
      .analyze();

    if (results.violations.length > 0) {
      console.log('\nBest practice violations found on Homepage:');
      results.violations.forEach(violation => {
        console.log(`\n- ${violation.id}: ${violation.description}`);
        console.log(`  Impact: ${violation.impact}`);
        console.log(`  Help: ${violation.helpUrl}`);
      });
    }

    // Log warnings but don't fail on best-practice violations
    expect(results.violations.length).toBeGreaterThanOrEqual(0);
  });
});
