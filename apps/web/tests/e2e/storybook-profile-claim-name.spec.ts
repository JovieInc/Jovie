import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// JOV-10711: adjacent flex labels must retain their semantic separator.
// The real component and canonical CSS come from its existing Storybook story.
for (const width of [320, 390]) {
  test(`mobile profile claim label matches its accessible name at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(
      '/iframe.html?id=profile-profilecompactsurface--proof-claim-bar&viewMode=story'
    );

    const claim = page.getByTestId('profile-proof-claim-bar-cta');
    const dock = page.getByTestId('profile-bottom-nav');
    await expect(claim).toBeVisible();
    await expect(dock).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    // Axe measures visible label-in-name behavior, beyond an aria literal.
    const result = await new AxeBuilder({ page })
      .include('[data-testid="profile-proof-claim-bar-cta"]')
      .withRules(['label-content-name-mismatch'])
      .analyze();
    expect(result.violations).toEqual([]);
    expect(result.incomplete).toEqual([]);
    await expect(claim).toHaveAccessibleName('jov.ie/you Claim yours');
    await expect(claim).toHaveAttribute('href', '/start');

    const claimBox = await claim.boundingBox();
    const dockBox = await dock.boundingBox();
    expect(claimBox).not.toBeNull();
    expect(dockBox).not.toBeNull();
    await claim.focus();
    await expect(claim).toBeFocused();
    expect(await claim.boundingBox()).toEqual(claimBox);
    expect(await dock.boundingBox()).toEqual(dockBox);
  });
}
