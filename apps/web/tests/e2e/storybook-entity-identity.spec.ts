import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`entity identity consumers render at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const stories = [
      ['dashboard-molecules-profilepreview--verified-fallback', 'Sasha Waves'],
      ['shell-artistavatarstack--overflow', '+1 artists'],
      ['jovie-entitypreviewpane--calendar-event', 'The Echo'],
      [
        'dashboard-organisms-enhanceddashboardlinks--connected-profile',
        'Sasha Waves',
      ],
    ];
    for (const [id, name] of stories) {
      await page.goto(`/iframe.html?id=${id}&viewMode=story`);
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
      await expect(page.locator('.sb-errordisplay')).toBeHidden();
    }
  });
}

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

for (const width of [1440, 390, 320]) {
  test(`Identity pinned profile keeps its name and actions readable at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(
      '/iframe.html?id=presence-profilespublicsources--pinned-profile-and-actions&viewMode=story'
    );
    const edit = page.getByRole('button', { name: 'Edit Jovie Profile' });
    await expect(edit).toBeVisible();
    const row = page.getByRole('row').nth(1);
    const title = row.getByText('Jovie Profile', { exact: true });
    await expect(title).toBeVisible();
    expect(
      await title.evaluate(
        element => element.scrollWidth <= element.clientWidth
      )
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    if (width < 640) {
      const titleBox = await title.boundingBox();
      const statusBox = await row
        .getByText('Unavailable', { exact: true })
        .filter({ visible: true })
        .first()
        .boundingBox();
      expect(statusBox!.y).toBeGreaterThanOrEqual(
        titleBox!.y + titleBox!.height - 1
      );
      // Text Button keeps its compact face and owns a 44px pseudo hit target.
      const hitTarget = await edit.evaluate(element => {
        const style = getComputedStyle(element, '::before');
        return {
          width: Number.parseFloat(style.width),
          height: Number.parseFloat(style.height),
        };
      });
      expect(hitTarget.width).toBeGreaterThanOrEqual(44);
      expect(hitTarget.height).toBeGreaterThanOrEqual(44);
    }
    const actions = row.getByRole('button', {
      name: 'Actions for Jovie Profile',
    });
    if (width < 640) {
      expect((await actions.boundingBox())!.width).toBeGreaterThanOrEqual(44);
      expect((await actions.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({
      path: testInfo.outputPath(`identity-${width}.png`),
      fullPage: true,
    });
    await actions.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('menuitem', { name: 'Ask Jovie' })
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(actions).toBeFocused();
  });
}
