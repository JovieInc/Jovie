import { expect, test } from './setup';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Homepage chat intake', () => {
  test('happy path: pill prefill + edit + Enter persists intent and redirects to /signin', async ({
    page,
  }) => {
    await page.goto('/');

    const input = page.getByPlaceholder('Message...');
    await expect(input).toBeVisible();

    await page.getByRole('button', { name: 'Create release page' }).click();
    await expect(input).toHaveValue('Create a release page for ');

    await input.pressSequentially('my new EP');
    await input.press('Enter');

    await page.waitForURL(/\/signin/);
    expect(page.url()).toContain('redirect_url=%2Fonboarding');

    const storedRaw = await page.evaluate(() =>
      window.localStorage.getItem('jovie_homepage_intent')
    );
    expect(storedRaw).toBeTruthy();
    const stored = JSON.parse(storedRaw as string);
    expect(stored.source).toBe('homepage');
    expect(stored.finalPrompt).toBe('Create a release page for my new EP');
    expect(stored.pillId).toBe('create_release_page');
    expect(stored.experimentId).toBe('homepage_intent_pills_v1');
  });

  test('free-form submit stores intent with pillId=null', async ({ page }) => {
    await page.goto('/');
    const input = page.getByPlaceholder('Message...');
    await input.pressSequentially('something completely custom');
    await input.press('Enter');

    await page.waitForURL(/\/signin/);

    const stored = await page.evaluate(() => {
      const raw = window.localStorage.getItem('jovie_homepage_intent');
      return raw ? JSON.parse(raw) : null;
    });
    expect(stored.pillId).toBeNull();
    expect(stored.pillLabel).toBeNull();
    expect(stored.finalPrompt).toBe('something completely custom');
  });

  test('mobile: chip row is a single horizontal scroll line, never wraps or stacks', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    const pills = page.getByRole('button', {
      name: /Create release page|Generate album art|Generate playlist pitch|Plan a release/,
    });
    await expect(pills).toHaveCount(4);

    const tops = await pills.evaluateAll(els =>
      els.map(el => el.getBoundingClientRect().top)
    );
    expect(new Set(tops).size).toBe(1);
  });
});
