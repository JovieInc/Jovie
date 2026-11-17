import { expect, type Page, type TestInfo, test } from '@playwright/test';

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

function watchAvatarResources(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400)
      errors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', request => {
    errors.push(`${request.failure()?.errorText} ${request.url()}`);
  });
  return errors;
}

async function captureAvatar(page: Page, info: TestInfo, name: string) {
  const bounds = (await page.locator('#storybook-root').boundingBox())!;
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({
    path,
    animations: 'disabled',
    clip: {
      x: Math.max(0, bounds.x - 8),
      y: Math.max(0, bounds.y - 8),
      width: bounds.width + 16,
      height: bounds.height + 16,
    },
  });
  await info.attach(name, { path, contentType: 'image/png' });
}

for (const theme of ['light', 'dark'] as const) {
  test(`Avatar local portraits load and artwork stays complete in ${theme}`, async ({
    page,
  }, testInfo) => {
    const errors = watchAvatarResources(page);
    await page.addInitScript(value => {
      localStorage.setItem('jovie-theme-storybook', value);
    }, theme);
    let releasePortrait = () => {};
    const pendingPortrait = new Promise<void>(resolve => {
      releasePortrait = resolve;
    });
    await page.route('**/images/avatars/tim-white.jpg', async route => {
      await pendingPortrait;
      await route.continue();
    });
    await page.goto(
      '/iframe.html?id=ui-atoms-avatar--with-image&viewMode=story',
      { waitUntil: 'domcontentloaded' }
    );
    const root = page.locator('#storybook-root');
    const portrait = root.locator('img');
    try {
      await expect(portrait).toBeVisible();
      const frame = root.locator('[data-shape="person"]');
      const pendingFrame = await frame.boundingBox();
      expect(pendingFrame).toMatchObject({ width: 32, height: 32 });
      await expect(portrait).toHaveJSProperty('complete', false);
      releasePortrait();
      await page.waitForLoadState('load');
      await expect
        .poll(() =>
          portrait.evaluate(
            image =>
              image instanceof HTMLImageElement &&
              image.complete &&
              image.naturalWidth > 0
          )
        )
        .toBe(true);
      expect(await frame.boundingBox()).toEqual(pendingFrame);
      expect(
        await frame.evaluate(node => {
          const radius = getComputedStyle(node).borderRadius;
          return radius.endsWith('%')
            ? Number.parseFloat(radius) >= 50
            : Number.parseFloat(radius) >=
                node.getBoundingClientRect().width / 2;
        })
      ).toBe(true);
    } finally {
      releasePortrait();
    }
    expect(
      new URL((await portrait.getAttribute('src'))!, page.url()).origin
    ).toBe(new URL(page.url()).origin);
    await expect(
      root.getByRole('img', { name: 'online status' })
    ).toBeVisible();
    await expect(root.locator('[data-shape="person"]')).toHaveCSS(
      'width',
      '32px'
    );
    await expect(root.locator('[data-shape="person"]')).toHaveCSS(
      'height',
      '32px'
    );
    await expect(portrait).toHaveCSS('object-fit', 'cover');
    await captureAvatar(page, testInfo, `avatar-portrait-${theme}`);

    await page.goto(
      '/iframe.html?id=ui-atoms-avatar--artwork-composition&viewMode=story'
    );
    const artwork = root.locator('img');
    await expect(artwork).toHaveCount(2);
    for (const image of await artwork.all()) {
      await expect
        .poll(() =>
          image.evaluate(
            node =>
              node instanceof HTMLImageElement &&
              node.complete &&
              node.naturalWidth > 0
          )
        )
        .toBe(true);
      expect(
        await image.evaluate(
          node =>
            node instanceof HTMLImageElement &&
            node.naturalHeight > node.naturalWidth
        )
      ).toBe(true);
      await expect(image).toHaveCSS('object-fit', 'contain');
      const frame = image.locator('..');
      await expect(frame).toHaveAttribute('data-shape', 'artwork');
      await expect(frame).toHaveCSS('width', '96px');
      await expect(frame).toHaveCSS('height', '96px');
      expect(await frame.boundingBox()).toMatchObject({
        width: 96,
        height: 96,
      });
    }
    await expect(page.locator('html')).toHaveClass(
      new RegExp(`\\b${theme}\\b`)
    );
    await captureAvatar(page, testInfo, `avatar-artwork-${theme}`);
    expect(errors).toEqual([]);
  });

  test(`Avatar decode failures preserve named fallback and frame in ${theme}`, async ({
    page,
  }, testInfo) => {
    const errors = watchAvatarResources(page);
    await page.addInitScript(value => {
      localStorage.setItem('jovie-theme-storybook', value);
      window.addEventListener(
        'error',
        event => {
          if (event.target instanceof HTMLImageElement) {
            document.documentElement.dataset.avatarNativeError = JSON.stringify(
              {
                src: event.target.getAttribute('src'),
                complete: event.target.complete,
                naturalWidth: event.target.naturalWidth,
              }
            );
          }
        },
        true
      );
    }, theme);
    for (const [story, name, initials] of [
      ['image-failure', 'Tim White', 'TW'],
      ['error-state', 'Alex Chen', 'AC'],
    ]) {
      await page.goto(
        `/iframe.html?id=ui-atoms-avatar--${story}&viewMode=story`
      );
      const root = page.locator('#storybook-root');
      await expect(root.getByRole('img', { name, exact: true })).toHaveText(
        initials
      );
      await expect(root.locator('img')).toHaveCount(0);
      const frame = root.locator('[data-shape="person"]');
      await expect(frame).toHaveAttribute('data-ring', 'true');
      await expect(frame).toHaveCSS('width', '32px');
      await expect(frame).toHaveCSS('height', '32px');
      expect(await frame.boundingBox()).toMatchObject({
        width: 32,
        height: 32,
      });
      expect(
        await frame.evaluate(node => {
          const radius = getComputedStyle(node).borderRadius;
          return radius.endsWith('%')
            ? Number.parseFloat(radius) >= 50
            : Number.parseFloat(radius) >=
                node.getBoundingClientRect().width / 2;
        })
      ).toBe(true);
      await expect(page.locator('html')).toHaveAttribute(
        'data-avatar-native-error',
        /.+/
      );
      const nativeError = JSON.parse(
        (await page.locator('html').getAttribute('data-avatar-native-error'))!
      );
      expect(nativeError).toMatchObject({ complete: true, naturalWidth: 0 });
      expect(nativeError.src).toMatch(/^data:image\//);
      if (story === 'image-failure')
        await expect(
          root.getByRole('img', { name: 'away status' })
        ).toBeVisible();
      await expect(page.locator('html')).toHaveClass(
        new RegExp(`\\b${theme}\\b`)
      );
      await captureAvatar(page, testInfo, `avatar-${story}-${theme}`);
    }
    expect(errors).toEqual([]);
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
    const row = page.getByTestId('profiles-workspace').getByRole('row').nth(1);
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
      const textBounds = async (element: import('@playwright/test').Locator) =>
        element.evaluate(node => {
          const range = document.createRange();
          range.selectNodeContents(node);
          const bounds = range.getBoundingClientRect();
          return { top: bounds.top, bottom: bounds.bottom };
        });
      const titleText = await textBounds(title);
      const statusText = await textBounds(
        row
          .getByText('Unavailable', { exact: true })
          .filter({ visible: true })
          .first()
      );
      expect(statusText.top).toBeGreaterThanOrEqual(titleText.bottom);
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
    const workspaceBounds = await page
      .getByTestId('profiles-workspace')
      .boundingBox();
    const rowBounds = await row.boundingBox();
    const actionBounds = await actions.boundingBox();
    expect(actionBounds!.x + actionBounds!.width).toBeLessThanOrEqual(
      workspaceBounds!.x + workspaceBounds!.width
    );
    expect(actionBounds!.y).toBeGreaterThanOrEqual(rowBounds!.y);
    expect(actionBounds!.y + actionBounds!.height).toBeLessThanOrEqual(
      rowBounds!.y + rowBounds!.height
    );
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

for (const routeWidth of [400, 432]) {
  test(`Combined Identity actions fit a ${routeWidth}px route beside the inspector`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 1000 });
    await page.goto(
      '/iframe.html?id=presence-profilespublicsources--combined-identity-actions-and-review&viewMode=story'
    );
    const workspace = page.getByTestId('profiles-workspace');
    await workspace
      .getByRole('button', { name: 'Review Identities (6)', exact: true })
      .click();
    await expect(page.getByText('Is this you?', { exact: true })).toBeVisible();
    await workspace.evaluate((element, width) => {
      element.style.width = `${width}px`;
      element.style.maxWidth = `${width}px`;
      element.style.flex = `0 0 ${width}px`;
    }, routeWidth);
    const row = workspace
      .locator('tbody tr')
      .filter({
        has: page.getByRole('button', {
          name: 'Edit Jovie Profile',
          exact: true,
        }),
      })
      .first();
    expect(
      await row.evaluate(element => {
        const row = element.getBoundingClientRect();
        const workspace = element
          .closest('[data-testid="profiles-workspace"]')!
          .getBoundingClientRect();
        return (
          row.width <= workspace.width &&
          [...element.querySelectorAll('button')].every(button => {
            const box = button.getBoundingClientRect();
            return (
              box.x >= workspace.x &&
              box.right <= workspace.right &&
              box.y >= row.y &&
              box.bottom <= row.bottom
            );
          })
        );
      })
    ).toBe(true);
    const status = workspace
      .getByText('Needs Qualification', { exact: true })
      .filter({ visible: true })
      .first();
    expect(
      await status.evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const text = range.getBoundingClientRect();
        const cell = element
          .closest('[data-table-cell-content]')!
          .getBoundingClientRect();
        return (
          text.top >= cell.top - 1 &&
          text.bottom <= cell.bottom + 1 &&
          text.right <= cell.right + 1
        );
      })
    ).toBe(true);
    await expect(
      workspace.getByRole('button', {
        name: 'Review Suggestions (0)',
        exact: true,
      })
    ).toBeVisible();
  });
}
