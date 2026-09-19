import type { Page } from '@playwright/test';
import { expect, test } from './setup';

// Anonymous public header: no authenticated session or provider fixture needed.
test.use({ storageState: { cookies: [], origins: [] } });

const headerSelector = '.marketing-glass-header';
const actionSelector =
  '.marketing-glass-header__nav-link:visible, .marketing-glass-header__text-link:visible, .marketing-glass-header__cta:visible';

async function openHeader(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/artist-profiles');
  await expect(page.locator(headerSelector)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function assertHeadingClear(page: Page) {
  await expect
    .poll(
      async () => {
        const header = await page
          .locator('.marketing-glass-header__shell')
          .boundingBox();
        const heading = await page
          .getByRole('heading', { level: 1 })
          .boundingBox();
        if (!header || !heading) return false;
        return heading.y >= header.y + header.height;
      },
      { message: 'Growing header must not obscure the first heading' }
    )
    .toBe(true);
}

async function assertTargets(page: Page) {
  const targets = await page.locator(actionSelector).evaluateAll(elements =>
    elements.map(element => {
      const face = element.getBoundingClientRect();
      const pseudo = getComputedStyle(element, '::before');
      const width = Math.max(face.width, Number.parseFloat(pseudo.width) || 0);
      const height = Math.max(
        face.height,
        Number.parseFloat(pseudo.height) || 0
      );
      const left = face.x + (face.width - width) / 2;
      const top = face.y + (face.height - height) / 2;
      const points = [
        [left + width / 2, top + 1],
        [left + width / 2, top + height - 1],
        [left + 1, top + height / 2],
        [left + width - 1, top + height / 2],
      ];
      const shell = element.closest('nav')?.getBoundingClientRect();
      if (!shell) throw new Error('Missing header shell');
      return {
        name: element.textContent,
        width,
        height,
        contained: top >= shell.top && top + height <= shell.bottom,
        owned: points.every(([x, y]) => {
          const hit = document.elementFromPoint(x, y);
          return hit !== null && element.contains(hit);
        }),
        rect: { left, top, right: left + width, bottom: top + height },
      };
    })
  );
  expect(targets.length).toBeGreaterThan(1);
  for (const target of targets) {
    expect(target.width, `${target.name}: target width`).toBeGreaterThanOrEqual(
      44
    );
    expect(
      target.height,
      `${target.name}: target height`
    ).toBeGreaterThanOrEqual(44);
    expect(target.contained, `${target.name}: target stays inside header`).toBe(
      true
    );
    expect(
      target.owned,
      `${target.name}: each target edge belongs to its action`
    ).toBe(true);
  }
  for (let i = 0; i < targets.length; i += 1) {
    for (let j = i + 1; j < targets.length; j += 1) {
      const a = targets[i].rect;
      const b = targets[j].rect;
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      expect(
        overlapX > 0.5 && overlapY > 0.5,
        'Neighboring actions must not steal each other’s target'
      ).toBe(false);
    }
  }
  return targets;
}

test('marketing header targets activate their own action and feedback follows rapid reversal', async ({
  page,
}) => {
  await openHeader(page, 1440);
  await assertTargets(page);
  await assertHeadingClear(page);
  const actions = page.locator(actionSelector);
  // Observe real pointer/keyboard events without leaving the public page or
  // submitting an external conversion during this geometry regression test.
  await actions.evaluateAll(elements =>
    elements.forEach(element => {
      element.setAttribute('data-test-activations', '0');
      element.addEventListener('click', event => {
        event.preventDefault();
        element.setAttribute(
          'data-test-activations',
          String(Number(element.getAttribute('data-test-activations')) + 1)
        );
      });
    })
  );
  for (const action of await actions.all()) {
    const box = await action.boundingBox();
    if (!box) throw new Error('Missing action bounds');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 21);
    await expect(action).toHaveAttribute('data-test-activations', '1');
    await action.focus();
    await page.keyboard.press('Enter');
    await expect(action).toHaveAttribute('data-test-activations', '2');
    expect(
      await action.evaluate(element => element.matches(':focus-visible'))
    ).toBe(true);
  }

  const first = actions.first();
  const last = actions.last();
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion });
    const before = await first.boundingBox();
    for (let reversal = 0; reversal < 3; reversal += 1) {
      await first.hover();
      expect(await first.evaluate(element => element.matches(':hover'))).toBe(
        true
      );
      await last.hover();
      expect(await first.evaluate(element => element.matches(':hover'))).toBe(
        false
      );
      expect(await last.evaluate(element => element.matches(':hover'))).toBe(
        true
      );
    }
    expect(await first.boundingBox()).toEqual(before);
    await assertTargets(page);
    await assertHeadingClear(page);
  }
  await page.screenshot({ path: test.info().outputPath('header-normal.png') });
  await openHeader(page, 390);
  await expect(page.getByTestId('header-nav')).toBeVisible();
  const shell = await page
    .locator('.marketing-glass-header__shell')
    .boundingBox();
  expect(shell).not.toBeNull();
  expect(
    (shell?.x ?? -1) >= 0 && (shell?.x ?? 0) + (shell?.width ?? 0) <= 390
  ).toBe(true);
  await page.screenshot({ path: test.info().outputPath('header-mobile.png') });
});

test('marketing header contains growing controls without overlapping targets', async ({
  browser,
  browserName,
  baseURL,
}, testInfo) => {
  test.skip(
    browserName !== 'chromium',
    'Chromium native minimum font-size setting'
  );
  const enlargedBrowser = await browser.browserType().launch({
    channel: testInfo.project.use.channel,
    args: ['--blink-settings=minimumFontSize=40'],
  });
  try {
    const page = await enlargedBrowser.newPage({ baseURL });
    for (const width of [1440, 1024]) {
      await openHeader(page, width);
      expect(
        await page
          .locator('.marketing-glass-header__cta')
          .evaluate(element =>
            Number.parseFloat(getComputedStyle(element).fontSize)
          )
      ).toBeGreaterThanOrEqual(40);
      await assertTargets(page);
      await assertHeadingClear(page);
      await page.screenshot({
        path: testInfo.outputPath(`header-native40-${width}.png`),
      });
    }
    await openHeader(page, 1440);
    // Also exercise growth beyond the old fixed 44px row using the same
    // explicit text-enlargement method as the existing homepage contract.
    await page.locator(actionSelector).evaluateAll(elements =>
      elements.forEach(element => {
        (element as HTMLElement).style.fontSize = '64px';
      })
    );
    await assertTargets(page);
    await assertHeadingClear(page);
    await page.screenshot({ path: testInfo.outputPath('header-font64.png') });
  } finally {
    await enlargedBrowser.close();
  }
});
