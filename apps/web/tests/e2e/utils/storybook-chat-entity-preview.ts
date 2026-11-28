import { expect, test } from '@playwright/test';

export function registerChatEntityPreviewOwnershipTest() {
  test('chat inline reference preview honors keyboard ownership and passive Escape', async ({
    page,
  }) => {
    await page.goto(
      '/iframe.html?id=jovie-entitychippopover--adjacent-references&viewMode=story'
    );
    const draft = page.getByRole('textbox', { name: 'Draft' });
    const first = page.getByRole('button', { name: /Release: Sober/ });
    const next = page.getByRole('button', {
      name: /Release: Midnight Drive/,
    });
    const preview = page.getByRole('dialog', { name: 'Sober' });
    await expect(first).toBeVisible({ timeout: 90_000 });
    await page.clock.install();

    await draft.fill('An unsent draft');
    await page.keyboard.press('Tab');
    await expect(first).toBeFocused();
    await expect(preview).toBeVisible();

    await next.hover();
    await page.clock.runFor(350);
    await expect(first).toBeFocused();
    await expect(preview).toBeVisible();
    await expect(next).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Escape');
    await page.clock.runFor(350);
    await expect(first).toBeFocused();
    await expect(preview).not.toBeVisible();

    await draft.focus();
    await first.hover();
    await page.clock.runFor(350);
    await expect(preview).toBeVisible();
    await expect(draft).toBeFocused();
    await page.keyboard.press('Escape');
    await page.clock.runFor(350);
    await expect(preview).not.toBeVisible();
    await expect(draft).toBeFocused();
    await expect(draft).toHaveValue('An unsent draft');
  });
}
