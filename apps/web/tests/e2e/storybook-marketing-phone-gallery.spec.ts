import { expect, test } from '@playwright/test';

const CONNECTED_STORY =
  '/iframe.html?id=marketing-connectedcomponentsgallery--default&viewMode=story';

for (const width of [320, 390, 767]) {
  test(`mobile previews have visible controls and preserve native scrolling at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(CONNECTED_STORY);
    const rail = page.getByRole('region', { name: 'Release pages' });
    const next = page.getByRole('button', { name: 'Next preview' });
    const previous = page.getByRole('button', { name: 'Previous preview' });
    await expect(next).toBeVisible();
    await expect(next).toBeEnabled();
    await expect(previous).toBeDisabled();

    const unfocusedIndicator = await next.evaluate(element => {
      const style = getComputedStyle(element);
      return { outline: style.outline, shadow: style.boxShadow };
    });
    await next.focus();
    await expect(next).toBeFocused();
    expect(
      await next.evaluate(element => element.matches(':focus-visible'))
    ).toBe(true);
    expect(
      await next.evaluate(element => {
        const style = getComputedStyle(element);
        return { outline: style.outline, shadow: style.boxShadow };
      })
    ).not.toEqual(unfocusedIndicator);
    const scrollTop = await page.evaluate(() => scrollY);
    await page.keyboard.press('Enter');
    await expect
      .poll(() => rail.evaluate(element => element.scrollLeft))
      .toBeGreaterThan(0);
    await expect(previous).toBeEnabled();
    if (width < 767) {
      await next.click();
    }
    await expect(next).toBeDisabled();
    const last = await rail.getByRole('listitem').last().boundingBox();
    expect(Math.round((last?.x ?? 0) + (last?.width ?? 0))).toBeLessThanOrEqual(
      width
    );
    expect(await page.evaluate(() => scrollY)).toBe(scrollTop);

    await rail.evaluate(element =>
      element.scrollTo({ left: 0, behavior: 'instant' })
    );
    await expect(previous).toBeDisabled();
    await rail.focus();
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(() => rail.evaluate(element => element.scrollLeft))
      .toBeGreaterThan(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBe(width);
  });
}

test('reduced-motion controls reveal the last preview without smooth scrolling', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(CONNECTED_STORY);
  const rail = page.getByRole('region', { name: 'Release pages' });
  const next = page.getByRole('button', { name: 'Next preview' });
  await expect(next).toBeEnabled();
  expect(
    await rail.evaluate(element => getComputedStyle(element).scrollBehavior)
  ).toBe('auto');
  await next.click();
  await next.click();
  await expect(next).toBeDisabled();
  await expect(rail.getByRole('figure').last()).toContainText('Your profile');
});

test('right-to-left previews advance and return with the same controls', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    '/iframe.html?id=marketing-marketingphonestategallery-states--rtl-arabic&viewMode=story'
  );
  const rail = page.getByRole('region', { name: 'حالات الملف' });
  const next = page.getByRole('button', { name: 'Next preview' });
  const previous = page.getByRole('button', { name: 'Previous preview' });
  await expect(next).toBeEnabled();
  await next.click();
  await expect
    .poll(() => rail.evaluate(element => element.scrollLeft))
    .toBeLessThan(0);
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(previous).toBeDisabled();
  await expect.poll(() => rail.evaluate(element => element.scrollLeft)).toBe(0);
});

test('desktop keeps every preview visible and omits mobile controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(CONNECTED_STORY);
  const rail = page.getByRole('region', { name: 'Release pages' });
  await expect(rail.getByRole('figure')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Next preview' })).toBeHidden();
  expect(await rail.evaluate(element => element.scrollWidth)).toBe(
    await rail.evaluate(element => element.clientWidth)
  );
  const figures = await rail.getByRole('figure').all();
  const bounds = await Promise.all(figures.map(figure => figure.boundingBox()));
  expect(new Set(bounds.map(box => box?.y)).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    1440
  );
});

test('forced colors retain a visible native keyboard focus indicator', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(CONNECTED_STORY);
  const next = page.getByRole('button', { name: 'Next preview' });
  await expect(next).toBeEnabled();
  await next.focus();
  await expect(next).toBeFocused();
  const indicator = await next.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      keyboardFocus: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineColor: style.outlineColor,
      shadow: style.boxShadow,
    };
  });
  expect(indicator.keyboardFocus).toBe(true);
  expect(indicator.outlineStyle).toBe('solid');
  expect(indicator.outlineWidth).toBeGreaterThan(0);
  expect(indicator.outlineColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(indicator.shadow).toBe('none');
});
