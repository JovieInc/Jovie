import type { Locator, Page } from '@playwright/test';
import { expect, test } from './setup';

test.use({ storageState: { cookies: [], origins: [] } });

async function targetGeometry(link: Locator) {
  return link.evaluate(element => {
    const face = element.getBoundingClientRect();
    const pseudo = getComputedStyle(element, '::before');
    const width = Math.max(face.width, Number.parseFloat(pseudo.width) || 0);
    const height = Math.max(face.height, Number.parseFloat(pseudo.height) || 0);
    const left = face.x + (face.width - width) / 2;
    const top = face.y + (face.height - height) / 2;
    return {
      faceHeight: face.height,
      width,
      height,
      left,
      top,
      right: left + width,
      bottom: top + height,
      owned: [
        [left + width / 2, top + 1],
        [left + width / 2, top + height - 1],
        [left + 1, top + height / 2],
        [left + width - 1, top + height / 2],
      ].every(([x, y]) => element.contains(document.elementFromPoint(x, y))),
      viewport: innerWidth,
    };
  });
}

async function assertAction(
  page: Page,
  secondary: Locator,
  primary: Locator,
  grown: boolean
) {
  await secondary.scrollIntoViewIfNeeded();
  const target = await targetGeometry(secondary);
  expect(target.faceHeight).toBeGreaterThanOrEqual(grown ? 40 : 28);
  if (!grown) expect(target.faceHeight).toBeLessThan(29);
  expect(target.height).toBeGreaterThanOrEqual(44);
  expect(target.width).toBeGreaterThanOrEqual(44);
  expect(
    target.owned,
    'All four invisible target edges activate this link'
  ).toBe(true);
  expect(target.left).toBeGreaterThanOrEqual(0);
  expect(target.right).toBeLessThanOrEqual(target.viewport);
  const other = await targetGeometry(primary);
  expect(
    Math.min(other.right, target.right) > Math.max(other.left, target.left) &&
      Math.min(other.bottom, target.bottom) > Math.max(other.top, target.top),
    'Wrapped primary and secondary hit targets never overlap'
  ).toBe(false);
  await page.mouse.click(target.left + target.width / 2, target.top + 1);
  await expect(secondary).toHaveAttribute(
    'data-test-activations',
    grown ? '3' : '1'
  );
  await secondary.focus();
  await expect(secondary).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(secondary).toHaveAttribute(
    'data-test-activations',
    grown ? '4' : '2'
  );
}

for (const route of [
  {
    path: '/voice',
    hero: 'voice-hero-section',
    primary: 'voice-hero-primary-cta',
    href: '/pricing',
  },
  {
    path: '/instant-merch',
    hero: 'marketing-section-hero',
    primary: 'instant-merch-primary-cta',
    href: '#instant-merch-flow',
  },
]) {
  test(`${route.path} secondary action preserves destination and growing hit geometry`, async ({
    page,
  }, testInfo) => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(route.path);
      const hero = page.getByTestId(route.hero);
      await expect(hero).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const secondary = hero.locator(`a[href="${route.href}"]`);
      const primary = page.getByTestId(route.primary);
      await expect(secondary).toHaveAttribute('href', route.href);
      await expect(secondary).toHaveAttribute('data-variant', 'ghost');
      // Count physical activations without leaving the reviewed page or
      // submitting a conversion; href is independently checked above.
      await secondary.evaluate(element => {
        element.setAttribute('data-test-activations', '0');
        element.addEventListener('click', event => {
          event.preventDefault();
          element.setAttribute(
            'data-test-activations',
            String(Number(element.getAttribute('data-test-activations')) + 1)
          );
        });
      });
      await assertAction(page, secondary, primary, false);
      await hero.screenshot({
        path: testInfo.outputPath(`hero-${width}-normal.png`),
      });
      for (const reducedMotion of ['no-preference', 'reduce'] as const) {
        await page.emulateMedia({ reducedMotion });
        const before = await secondary.boundingBox();
        for (let move = 0; move < 3; move += 1) {
          await secondary.hover();
          expect(
            await secondary.evaluate(element => element.matches(':hover'))
          ).toBe(true);
          await primary.hover();
          expect(
            await secondary.evaluate(element => element.matches(':hover'))
          ).toBe(false);
        }
        expect(await secondary.boundingBox()).toEqual(before);
        await secondary.hover();
        await page.mouse.down();
        expect(
          await secondary.evaluate(element => element.matches(':active'))
        ).toBe(true);
        await page.mouse.move(0, 0);
        await page.mouse.up();
        expect(
          await secondary.evaluate(element => element.matches(':active'))
        ).toBe(false);
        await expect(secondary).toHaveAttribute('data-test-activations', '2');
      }
      // Native font growth, not a screenshot transform.
      await hero.locator('a[data-size]').evaluateAll(elements => {
        for (const element of elements)
          (element as HTMLElement).style.fontSize = '40px';
      });
      await assertAction(page, secondary, primary, true);
      await hero.screenshot({
        path: testInfo.outputPath(`hero-${width}-font40.png`),
      });
    }
  });
}
