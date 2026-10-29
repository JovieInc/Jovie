import { expect, test } from '@playwright/test';

for (const width of [390, 1280]) {
  test(`founder draft keeps its source action and stable frame at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(
      '/iframe.html?id=features-onboarding-onboardingprofilerail--founder-draft&viewMode=story'
    );
    const rail = page.getByTestId(
      width < 1024
        ? 'onboarding-profile-rail-inline'
        : 'onboarding-profile-rail'
    );
    await expect(rail).toBeVisible();
    await expect(rail).toHaveAttribute('data-onboarding-stage', 'review');
    await expect(rail.getByText('Listen now', { exact: true })).toHaveCount(0);
    await expect(rail.getByText('Get Updates', { exact: true })).toHaveCount(0);
    const source = rail.getByRole('link', { name: 'View company or product' });
    await expect(source).toHaveAttribute('href', 'https://company.example/');
    await source.focus();
    await expect(source).toBeFocused();
    const before = await rail.boundingBox();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await rail.boundingBox()).toEqual(before);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
}
