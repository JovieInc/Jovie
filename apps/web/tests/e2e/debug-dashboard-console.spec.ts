import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { signInUser } from '../helpers/clerk-auth';
import { hasClerkCredentials } from '../helpers/clerk-credentials';

/**
 * Debug test to capture console errors from dashboard page
 */

test.describe('Dashboard Console Debug', () => {
  test('capture console errors during dashboard load', async ({ page }) => {
    if (!hasClerkCredentials()) {
      console.log('⚠ Skipping - no Clerk credentials');
      test.skip();
      return;
    }

    // Capture all console messages
    const consoleMessages: Array<{ type: string; text: string }> = [];
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
      });
    });

    // Capture page errors
    const pageErrors: Array<Error> = [];
    page.on('pageerror', error => {
      pageErrors.push(error);
    });

    // Capture navigation events
    const navigationLog: Array<string> = [];
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        navigationLog.push(`Navigated to: ${frame.url()}`);
      }
    });

    await setupClerkTestingToken({ page });

    console.log('\n🔍 Attempting sign-in...\n');
    try {
      await signInUser(page);
      console.log('\n✓ Sign-in successful\n');
    } catch (error) {
      console.log('\n✗ Sign-in failed:', error, '\n');
    }

    // Wait longer to let dashboard fully load
    await page.waitForTimeout(15000);

    // Log all console messages
    console.log('\n📋 Console Messages:\n');
    for (const msg of consoleMessages) {
      console.log(`[${msg.type}] ${msg.text}`);
    }

    // Log all page errors
    console.log('\n❌ Page Errors:\n');
    for (const error of pageErrors) {
      console.log(`${error.name}: ${error.message}`);
      console.log(`Stack: ${error.stack}`);
    }

    // Check if there are any errors
    if (pageErrors.length > 0) {
      console.log(`\n⚠️  Found ${pageErrors.length} page error(s)\n`);
    } else {
      console.log('\n✓ No page errors detected\n');
    }

    // Capture what's actually on the page
    console.log('\n🧭 Navigation Log:\n');
    for (const nav of navigationLog) {
      console.log(nav);
    }

    console.log('\n🔍 Page Info:\n');
    console.log('Current URL:', page.url());
    const bodyText = await page.locator('body').innerText();
    console.log('Body text (first 500 chars):', bodyText.slice(0, 500));

    // Check for specific elements
    console.log('\n🎯 Element Detection:\n');
    const hasUserButton = await page
      .locator('[data-clerk-element="userButton"]')
      .count();
    console.log(
      `- Clerk userButton: ${hasUserButton > 0 ? 'FOUND' : 'NOT FOUND'}`
    );

    const hasUserMenu = await page.locator('[data-testid="user-menu"]').count();
    console.log(
      `- user-menu testid: ${hasUserMenu > 0 ? 'FOUND' : 'NOT FOUND'}`
    );

    const hasDashboardHeader = await page
      .locator('[data-testid="dashboard-header"]')
      .count();
    console.log(
      `- dashboard-header testid: ${hasDashboardHeader > 0 ? 'FOUND' : 'NOT FOUND'}`
    );

    const hasProfileLinkCard = await page
      .locator('[data-testid="profile-link-card"]')
      .count();
    console.log(
      `- profile-link-card testid: ${hasProfileLinkCard > 0 ? 'FOUND' : 'NOT FOUND'}`
    );

    // Check for "Application error" text
    const hasAppError = bodyText.includes('Application error');
    console.log(
      `\n⚠️  Application error present: ${hasAppError ? 'YES - BAD!' : 'NO - GOOD!'}`
    );

    // This test always passes - it's just for debugging
    expect(true).toBe(true);
  });
});
