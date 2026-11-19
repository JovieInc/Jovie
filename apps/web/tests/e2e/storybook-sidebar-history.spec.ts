import { expect, test } from '@playwright/test';

const story = (name: string) =>
  `/iframe.html?id=dashboard-navigation-customer-rail--${name}&viewMode=story`;

async function openHistory(
  page: import('@playwright/test').Page,
  name: string
) {
  await page.goto(story(name));
  const trigger = page.getByRole('button', { name: 'Chat History' });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  return trigger;
}

test('desktop history is hidden on cold open and restores keyboard focus', async ({
  page,
}) => {
  const title = page.getByRole('link', {
    name: /Plan the full European summer/,
  });
  await page.goto(story('long-content-thread-titles'));
  await expect(title).toHaveCount(0);
  const trigger = page.getByRole('button', { name: 'Chat History' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(title).toBeVisible();
  await expect(page.getByRole('link', { name: 'All chats' })).toBeVisible();
  await page.screenshot({ path: '/tmp/jov-12958-desktop.png' });
  await title.focus();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(title).toHaveCount(0);
});

for (const [name, message] of [
  ['empty-threads', 'No chats yet'],
  ['error-threads-unavailable', 'Conversations unavailable'],
] as const) {
  test(`${name} appears after opening`, async ({ page }) => {
    await openHistory(page, name);
    await expect(page.getByText(message)).toBeVisible();
  });
}

test('loading history appears after opening', async ({ page }) => {
  await openHistory(page, 'loading-threads');
  await expect(page.locator('.skeleton').first()).toBeVisible();
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('touch opens history and Escape returns focus without closing the drawer', async ({
    page,
  }) => {
    await page.goto(story('long-content-thread-titles'));
    await page.keyboard.press('Control+b');
    const trigger = page.getByRole('button', { name: 'Chat History' });
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.tap();
    const title = page.getByRole('link', {
      name: /Plan the full European summer/,
    });
    await expect(title).toBeVisible();
    await page.screenshot({ path: '/tmp/jov-12958-mobile.png' });
    await title.focus();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
