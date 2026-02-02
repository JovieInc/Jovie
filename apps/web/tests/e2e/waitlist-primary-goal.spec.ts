import { expect, test } from '@playwright/test';

test.describe('Waitlist primary goal', () => {
  test('requires authentication before showing the waitlist form', async ({
    page,
  }) => {
    await page.goto('/waitlist', { waitUntil: 'domcontentloaded' });
    // App redirects unauthenticated users to signup with redirect_url
    await expect(page).toHaveURL(/\/(signin|signup)/);
    // Verify redirect_url is preserved for post-auth navigation
    expect(page.url()).toContain('redirect_url=%2Fwaitlist');
  });
});
