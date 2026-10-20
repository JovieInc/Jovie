import { devices, expect, test } from '@playwright/test';

const story =
  '/iframe.html?id=jovie-entitychippopover--source-references&viewMode=story';

for (const theme of ['light', 'dark']) {
  test(`inline source hover, focus, switching, safe open and geometry in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(
      value => localStorage.setItem('jovie-theme-storybook', value),
      theme
    );
    await page.goto(story);
    const transcript = page.getByTestId('source-transcript');
    const composer = page.getByRole('textbox', { name: 'Composer' });
    const triggers = page.getByTestId('entity-chip-popover-trigger');
    await expect(triggers).toHaveCount(5);
    await expect(transcript).not.toContainText('(source: enrichment)');
    const before = await transcript.boundingBox();
    const composerBefore = await composer.boundingBox();
    await triggers.nth(0).hover();
    const card = page.getByTestId('source-fact-card');
    await expect(card).toContainText('Direct source');
    await card.hover();
    await expect(card).toBeVisible();
    const directScreenshot = testInfo.outputPath(`source-direct-${theme}.png`);
    await page.screenshot({ path: directScreenshot, animations: 'disabled' });
    await testInfo.attach(`source-direct-${theme}`, {
      path: directScreenshot,
      contentType: 'image/png',
    });
    expect(await transcript.boundingBox()).toEqual(before);
    expect(await composer.boundingBox()).toEqual(composerBefore);
    await triggers.nth(2).hover();
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('Indirect enrichment');
    await expect(card).toContainText('unverified');
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
    await triggers.nth(0).focus();
    await expect(card).toBeVisible();
    await expect(triggers.nth(0)).toBeFocused();
    await page.keyboard.press('Enter');
    const link = page.getByRole('link', { name: 'Open Source' });
    await expect(link).toBeFocused();
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await page
      .context()
      .route('https://open.spotify.com/**', route =>
        route.fulfill({ body: '<p>Source fixture</p>' })
      );
    const popup = page.waitForEvent('popup');
    await link.click();
    const opened = await popup;
    await opened.waitForLoadState();
    expect(await opened.evaluate(() => window.opener)).toBeNull();
    await opened.close();
    await page.keyboard.press('Escape');
    await expect(triggers.nth(0)).toBeFocused();
    await triggers.nth(3).hover();
    await expect(card).toContainText('stale');
    await triggers.nth(4).hover();
    await expect(card).toContainText('Source unavailable');
    await expect(card).toContainText('unknown');
    await expect(composer).toHaveValue('Unsent draft');
    const screenshot = testInfo.outputPath(`source-card-${theme}.png`);
    await page.screenshot({ path: screenshot, animations: 'disabled' });
    await testInfo.attach(`source-card-${theme}`, {
      path: screenshot,
      contentType: 'image/png',
    });
  });
}

test('wrapped source at 200% text size repositions inside the viewport with reduced motion', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 640, height: 520 });
  await page.goto(story);
  await page.getByTestId('source-transcript').evaluate(element => {
    element.style.fontSize = '200%';
  });
  const trigger = page.getByTestId('entity-chip-popover-trigger').first();
  await trigger.focus();
  const overlay = page.getByTestId('entity-chip-popover-content');
  await expect(overlay).toBeVisible();
  const assertInViewport = async () => {
    const bounds = await overlay.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(640);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(520);
  };
  await assertInViewport();
  await page.mouse.wheel(0, 100);
  await assertInViewport();
  await testInfo.attach('source-zoom-reduced-motion', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
});

test('iPhone portrait tap uses the canonical bottom sheet and restores focus', async ({
  browser,
}, testInfo) => {
  const { defaultBrowserType: _, ...iphone } = devices['iPhone 13'];
  const context = await browser.newContext({
    ...iphone,
    baseURL: testInfo.project.use.baseURL,
  });
  const page = await context.newPage();
  await page.goto(story);
  const trigger = page.getByTestId('entity-chip-popover-trigger').first();
  const transcript = page.getByTestId('source-transcript');
  const before = await transcript.boundingBox();
  await trigger.tap();
  const sheet = page.getByTestId('entity-chip-source-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('data-side', 'bottom');
  await expect(sheet).toContainText('Direct source');
  expect(await transcript.boundingBox()).toEqual(before);
  const mobileScreenshot = testInfo.outputPath('source-iphone-sheet.png');
  await page.screenshot({ path: mobileScreenshot, animations: 'disabled' });
  await testInfo.attach('source-iphone-sheet', {
    path: mobileScreenshot,
    contentType: 'image/png',
  });
  await page.getByTestId('sheet-close-button').tap();
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.tap();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
  await context.close();
});

test('streaming, public, restricted and recovered receipts preserve transcript geometry', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=jovie-entitychippopover--receipt-transitions&viewMode=story'
  );
  const transcript = page.getByTestId('receipt-transcript');
  const composer = page.getByRole('textbox', { name: 'Composer' });
  const advance = page.getByRole('button', { name: 'Advance receipt' });
  const trigger = page.getByTestId('entity-chip-popover-trigger');
  await expect(transcript).toBeVisible();
  const before = await transcript.boundingBox();
  const composerBefore = await composer.boundingBox();
  await expect(trigger).toHaveCount(0);
  for (const count of [1, 0, 1]) {
    await advance.click();
    await expect(trigger).toHaveCount(count);
    expect(await transcript.boundingBox()).toEqual(before);
    expect(await composer.boundingBox()).toEqual(composerBefore);
    await expect(composer).toHaveValue('Unsent draft');
  }
});
