import { expect, test } from '@playwright/test';
import { openHomeWelcome } from './helpers/golden-path-home-welcome';

// Navigation/fixture timing only; real Home/auth coverage stays in golden-path.
test('reads the welcome and composer while an image is still loading', async ({
  page,
}) => {
  test.setTimeout(10_000);
  let releaseImage = () => {};
  const imageReady = new Promise<void>(resolve => {
    releaseImage = resolve;
  });
  await page.route('**/slow-welcome-image', async route => {
    await imageReady;
    await route.abort();
  });
  await page.route('**/app/chat', route =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><body>
        <h2 data-testid="chat-empty-state-greeting-text">Welcome</h2>
        <input aria-label="Chat message input">
        <img src="/slow-welcome-image" alt="">
      </body></html>`,
    })
  );
  try {
    const welcome = await openHomeWelcome(page);
    expect(welcome.initialGreeting).toBe('Welcome');
    expect(welcome.before?.height).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.readyState)).toBe('interactive');
  } finally {
    releaseImage();
  }
});
