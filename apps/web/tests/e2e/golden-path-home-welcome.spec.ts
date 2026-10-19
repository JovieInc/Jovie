import { expect, test } from '@playwright/test';
import { openHomeWelcome } from './helpers/golden-path-home-welcome';

// Navigation/fixture timing only; real Home/auth coverage stays in golden-path.
test('observes and releases the welcome summary while an image is still loading', async ({
  page,
}) => {
  test.setTimeout(10_000);
  let releaseImage = () => {};
  const imageReady = new Promise<void>(resolve => {
    releaseImage = resolve;
  });
  let releaseSummary = () => {};
  const summaryReady = new Promise<void>(resolve => {
    releaseSummary = resolve;
  });
  await page.route('**/slow-welcome-image', async route => {
    await imageReady;
    await route.abort();
  });
  await page.route('**/api/insights/summary', async route => {
    await summaryReady;
    await route.fulfill({ json: { greeting: 'Summary received' } });
  });
  await page.route('**/app/chat', route =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><body>
        <h2 data-testid="chat-empty-state-greeting-text">Welcome</h2>
        <div data-testid="chat-empty-state-next-step"><p role="status">Finding your next step…</p></div>
        <input aria-label="Chat message input">
        <img src="/slow-welcome-image" alt="">
        <script>
          fetch('/api/insights/summary').then(r => r.json()).then(data => {
            document.querySelector('[role="status"]').textContent = data.greeting;
          });
        </script>
      </body></html>`,
    })
  );
  try {
    const pending = await openHomeWelcome(page, releaseSummary);
    expect(pending.initialGreeting).toBe('Welcome');
    expect(pending.before?.height).toBeGreaterThan(0);
    await expect(page.getByRole('status')).toHaveText('Summary received');
    expect(await page.evaluate(() => document.readyState)).toBe('interactive');
  } finally {
    releaseSummary();
    releaseImage();
  }
});
