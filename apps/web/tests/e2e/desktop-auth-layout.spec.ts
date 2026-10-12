import { expect, type Page, test } from '@playwright/test';

// Presentation contract on the mounted route. Inert native bridge fixtures never
// open a browser, redeem credentials, or certify an authenticated native session.
test.use({ storageState: { cookies: [], origins: [] } });

async function openHandoff(page: Page, failure = false) {
  await page.addInitScript(
    ({ failure }) => {
      Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        value: {
          openDesktopAuthUrl: async () => ({ ok: !failure }),
          copyDesktopAuthUrl: async () => ({ ok: true }),
          closeDesktopAuthWindow: async () => ({ ok: true }),
          redeemDesktopAuthReturnCode: async () => ({
            ok: false,
            reason: 'invalid-code',
          }),
          notifyAppBooted: () => undefined,
        },
      });
    },
    { failure }
  );
  const authUrl =
    '/auth/start?client=electron&intent=sign_in&return_to=%2Fapp%2Fsettings&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256';
  await page.goto(`/desktop-auth?auth_url=${encodeURIComponent(authUrl)}`);
  await expect(page.getByTestId('desktop-auth-hierarchy')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-auth-action="primary"]')).toBeEnabled();
}

async function hierarchyViolations(page: Page) {
  return page.getByTestId('desktop-auth-hierarchy').evaluate(root => {
    const control = (action: string) => {
      const node = root.querySelector<HTMLButtonElement>(
        `[data-auth-action="${action}"]`
      );
      if (!node) throw new Error(`Missing ${action}`);
      return {
        node,
        box: node.getBoundingClientRect(),
        style: getComputedStyle(node),
      };
    };
    const primary = control('primary');
    const options = control('options');
    const cancel = control('cancel');
    const hitHeight = (control: typeof primary) =>
      Math.max(
        control.box.height,
        Number.parseFloat(getComputedStyle(control.node, '::before').height) ||
          0
      );
    const primaryHitBottom =
      primary.box.top + primary.box.height / 2 + hitHeight(primary) / 2;
    const utilityHitTop =
      options.box.top + options.box.height / 2 - hitHeight(options) / 2;
    const header = root.querySelector('header')?.getBoundingClientRect();
    const status = root
      .querySelector('[role="status"]')
      ?.getBoundingClientRect();
    const failures: string[] = [];
    if (primaryHitBottom > utilityHitTop + 1)
      failures.push('overlapping-hit-targets');
    if (!header || primary.box.top - header.bottom > 24)
      failures.push('dispersed-primary');
    if (
      Math.abs(options.box.top - cancel.box.top) > 1 ||
      options.box.top - primary.box.bottom > 16
    )
      failures.push('dispersed-utilities');
    if (options.box.right > cancel.box.left)
      failures.push('overlapping-utilities');
    for (const utility of [options, cancel]) {
      if (
        utility.style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
        utility.box.width >= primary.box.width * 0.8
      )
        failures.push('competing-emphasis');
    }
    if (
      status &&
      status.top - Math.max(options.box.bottom, cancel.box.bottom) > 8
    )
      failures.push('blank-status-band');
    if (primary.box.top < 0 || primary.box.bottom > innerHeight)
      failures.push('unreachable-primary');
    return failures;
  });
}

async function expectReachable(page: Page) {
  const controls = page
    .getByTestId('desktop-auth-hierarchy')
    .locator('button:visible, input:visible');
  for (const control of await controls.all()) {
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeInViewport({ ratio: 1 });
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error('Missing control bounds');
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.y + box.height).toBeLessThanOrEqual(
      page.viewportSize()!.height + 1
    );
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
}

for (const viewport of [
  { width: 840, height: 322 },
  { width: 680, height: 312 },
  { width: 390, height: 252 },
]) {
  test(`keeps compact default, waiting, code and QR controls reachable at ${viewport.width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openHandoff(page);
    await testInfo.attach('default', {
      body: await page.screenshot({ path: testInfo.outputPath('default.png') }),
      contentType: 'image/png',
    });
    expect(await hierarchyViolations(page)).toEqual([]);
    const primary = page.locator('[data-auth-action="primary"]');
    const before = await primary.boundingBox();
    await primary.click();
    await expect(primary).toHaveText('Open Browser Again');
    const after = await primary.boundingBox();
    expect(after?.y).toBe(before?.y);
    await expectReachable(page);
    await page.getByRole('button', { name: 'Other Sign-in Options' }).click();
    await page
      .getByRole('button', { name: 'Enter A Code', exact: true })
      .click();
    await expect(page.getByRole('textbox')).toBeFocused();
    await expectReachable(page);
    await testInfo.attach('code', {
      body: await page.screenshot({ path: testInfo.outputPath('code.png') }),
      contentType: 'image/png',
    });
    await page.getByRole('button', { name: 'Back To Sign-in Options' }).click();
    await page.getByRole('button', { name: 'Scan With Phone' }).click();
    await expect(
      page.getByRole('img', { name: 'QR Code With Your Sign-in Link' })
    ).toBeVisible();
    await expectReachable(page);
    await testInfo.attach('qr', {
      body: await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath('qr.png'),
      }),
      contentType: 'image/png',
    });
  });
}

test('rejects three semantically correct controls with dispersed spacing or competing emphasis', async ({
  page,
}) => {
  await page.setViewportSize({ width: 840, height: 322 });
  await openHandoff(page);
  expect(await hierarchyViolations(page)).toEqual([]);
  // Same production labels, variants and control count. Only painted geometry
  // changes, reproducing the blind spot in the old semantic-only fixture.
  await page.addStyleTag({
    content:
      '[data-auth-action="options"], [data-auth-action="cancel"] { background: red !important; width: 100% !important; margin-top: 56px !important; }',
  });
  await expect(page.locator('[data-auth-action]')).toHaveCount(3);
  await expect(page.locator('[data-auth-action="primary"]')).toHaveAttribute(
    'data-variant',
    'primary'
  );
  await expect(page.locator('[data-auth-action="cancel"]')).toHaveAttribute(
    'data-variant',
    'link'
  );
  expect(await hierarchyViolations(page)).toEqual(
    expect.arrayContaining(['competing-emphasis', 'dispersed-utilities'])
  );
});

test('preserves primary geometry through browser failure and makes long scaled copy scrollable', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 840, height: 322 });
  await openHandoff(page, true);
  const primary = page.locator('[data-auth-action="primary"]');
  const before = await primary.boundingBox();
  await primary.click();
  await expect(primary).toHaveText('Try Again');
  expect((await primary.boundingBox())?.y).toBe(before?.y);
  await expect(primary).toBeFocused();
  await expectReachable(page);
  await testInfo.attach('error', {
    body: await page.screenshot({ path: testInfo.outputPath('error.png') }),
    contentType: 'image/png',
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expectReachable(page);
});
