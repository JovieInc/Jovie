import { expect, test } from '@playwright/test';

test('anchors and searches recent chats on the mounted content seam', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(
    '/iframe.html?id=organisms-unifiedsidebar--composed-history&viewMode=story'
  );
  const chat = page.getByRole('link', { name: 'Chat', exact: true });
  await chat.press('ArrowRight');
  const history = page.getByRole('dialog', { name: 'Recent Chats' });
  const seam = (await page
    .locator('[data-app-shell-main-plane]')
    .boundingBox())!.x;
  await expect.poll(async () => (await history.boundingBox())?.x).toBe(seam);
  await expect.poll(async () => (await history.boundingBox())?.width).toBe(280);
  const search = history.getByRole('searchbox', { name: 'Search Chats' });
  await expect.poll(async () => (await search.boundingBox())?.height).toBe(28);
  await expect(search).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await search.fill('No fixture matches this');
  await expect(history.getByRole('status')).toHaveText('No chats match');
  await search.press('Escape');
  await expect(chat).toBeFocused();
});

test('keeps the sidebar history inside a narrow viewport', async ({ page }) => {
  const viewport = { width: 260, height: 600 };
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(
    '/iframe.html?id=shell-sidebarchataction--chat&viewMode=story'
  );

  const chat = page.getByRole('link', { name: 'Chat', exact: true });
  await chat.press('ArrowRight');
  const history = page.getByRole('dialog', { name: 'Recent Chats' });
  const search = history.getByRole('searchbox', { name: 'Search Chats' });
  await expect(search).toBeVisible();
  await expect
    .poll(async () => {
      const box = await history.boundingBox();
      return Boolean(
        box &&
          box.width > 0 &&
          box.width < 280 &&
          box.x >= 0 &&
          box.x + box.width <= viewport.width
      );
    })
    .toBe(true);
  await search.press('Escape');
  await expect(chat).toBeFocused();
});
