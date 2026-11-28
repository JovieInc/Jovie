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
  await expect.poll(async () => (await history.boundingBox())?.width).toBe(420);
  const search = history.getByRole('searchbox', { name: 'Search Chats' });
  await expect.poll(async () => (await search.boundingBox())?.height).toBe(28);
  await expect(search).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await search.fill('No fixture matches this');
  await expect(history.getByRole('status')).toHaveText('No chats match');
  await search.press('Escape');
  await expect(chat).toBeFocused();
});
