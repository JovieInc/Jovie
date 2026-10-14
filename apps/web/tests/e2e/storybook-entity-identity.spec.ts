import { expect, test } from '@playwright/test';

for (const width of [1440, 834, 390]) {
  for (const theme of ['dark', 'light']) {
    test(`entity identity preserves semantics and geometry at ${width}px in ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        value => localStorage.setItem('jovie-theme-storybook', value),
        theme
      );
      let failImage: (() => void) | undefined;
      const imageFailure = new Promise<void>(resolve => {
        failImage = resolve;
      });
      await page.route('**/identity-failure.jpg', async route => {
        await imageFailure;
        await route.fulfill({ status: 404, body: '' });
      });
      await page.goto(
        '/iframe.html?id=molecules-drawer-entityheader--identity-states&viewMode=story',
        { waitUntil: 'domcontentloaded' }
      );
      const person = page.getByTestId('identity-person');
      const release = page.getByTestId('identity-release');
      const event = page.getByTestId('identity-event');
      await expect(person).toBeVisible();
      const before = await person.boundingBox();
      const titleBefore = await page
        .getByText('Midnight Drive', { exact: true })
        .boundingBox();
      failImage?.();
      await expect(person).toContainText('MV');
      expect(await person.boundingBox()).toEqual(before);
      expect(
        await page.getByText('Midnight Drive', { exact: true }).boundingBox()
      ).toEqual(titleBefore);
      expect(before?.width).toBe(56);
      expect(before?.height).toBe(56);
      expect(
        await person
          .getByRole('img', { name: 'Maya Vale', exact: true })
          .evaluate(node => {
            const radius = getComputedStyle(node).borderRadius;
            return radius.endsWith('%')
              ? Number.parseFloat(radius) >= 50
              : Number.parseFloat(radius) >=
                  node.getBoundingClientRect().width / 2;
          })
      ).toBe(true);
      await expect(
        page.getByRole('img', { name: 'Verified Jovie Profile' })
      ).toBeVisible();
      expect(
        await release
          .locator('img')
          .evaluate(node => getComputedStyle(node).objectFit)
      ).toBe('contain');
      expect(await release.boundingBox()).toMatchObject({
        width: 56,
        height: 56,
      });
      await expect(event).toContainText('JUN');
      await expect(event).toContainText('12');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
      const capturePath = testInfo.outputPath(
        `entity-identity-${width}-${theme}.png`
      );
      await page.screenshot({ path: capturePath, animations: 'disabled' });
      await testInfo.attach(`entity-identity-${width}-${theme}.png`, {
        path: capturePath,
        contentType: 'image/png',
      });
    });
  }
}
