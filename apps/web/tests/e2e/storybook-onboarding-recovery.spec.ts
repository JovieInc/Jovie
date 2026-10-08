import { expect, test } from '@playwright/test';

// Component interaction proof, without auth, DB, music enrichment, or model calls.
// The unchanged real-auth Golden Path remains JOV-7192's acceptance gate.
const cases = [
  {
    name: 'desktop',
    width: 1280,
    theme: 'dark',
    reducedMotion: 'no-preference',
  },
  { name: 'tablet', width: 1024, theme: 'dark', reducedMotion: 'reduce' },
  { name: 'mobile', width: 390, theme: 'dark', reducedMotion: 'reduce' },
  {
    name: 'desktop light',
    width: 1280,
    theme: 'light',
    reducedMotion: 'reduce',
  },
] as const;

for (const scenario of cases) {
  test(`artist confirmation keeps the handle turn reachable: ${scenario.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: scenario.width, height: 720 });
    await page.emulateMedia({ reducedMotion: scenario.reducedMotion });
    await page.goto(
      '/iframe.html?id=features-onboarding-chatrecovery--second-turn&viewMode=story'
    );
    const input = page.getByRole('textbox', { name: 'Chat Message Input' });
    const send = page.getByRole('button', {
      name: 'Send message',
      exact: true,
    });
    await input.waitFor();
    await page.evaluate(theme => {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      document.documentElement.dataset.theme = theme;
    }, scenario.theme);

    await input.fill('https://open.spotify.com/artist/1ZlSI1juLMMN1HU8X7RViN');
    await send.click();
    await expect(page.getByTestId('submitted-turn-count')).toHaveText('1');
    await expect(
      page.getByTestId(
        scenario.width >= 1024
          ? 'onboarding-profile-rail'
          : 'onboarding-profile-rail-inline'
      )
    ).toBeVisible();
    await input.fill('Set my profile handle');
    await expect(send).toBeEnabled();
    await send.scrollIntoViewIfNeeded();

    // A synthetic DOM click misses the regression: the preview intercepted
    // the physical pointer even though the Send control was enabled.
    const receivesPointer = await send.evaluate(button => {
      const rect = button.getBoundingClientRect();
      return button.contains(
        document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2
        )
      );
    });
    expect(receivesPointer).toBe(true);
    await send.click();
    await expect(page.getByTestId('submitted-turn-count')).toHaveText('2');
    await expect(
      page.getByRole('textbox', { name: 'Proposed handle' })
    ).toBeVisible();
    await expect(input).toHaveValue('');
    await expect(
      page.getByRole('link', { name: 'Sign in', exact: true })
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
}
