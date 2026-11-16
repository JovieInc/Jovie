import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { wcag22AaAxeOptions } from '@/lib/a11y-gates/wcag-standard.cjs';

const story =
  '/iframe.html?id=organisms-appshellframe--launch-light&viewMode=story';

test.beforeEach(async ({ page }) => {
  // Exercise real motion, rather than Storybook's snapshot freeze.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'matchMedia', {
      value: window.matchMedia.bind(window),
      configurable: false,
      writable: false,
    });
    new MutationObserver(() => {
      document
        .querySelectorAll('style[data-jovie-storybook-fixtures]')
        .forEach(node => node.remove());
    }).observe(document, { childList: true, subtree: true });

    document.addEventListener('animationstart', event => {
      if (
        !(event.target instanceof HTMLElement) ||
        event.target.id !== 'main-content' ||
        event.pseudoElement !== '::after'
      ) {
        return;
      }
      // Hold the first painted state so pointer/keyboard checks cannot pass
      // merely because the short animation finished before automation arrived.
      const main = event.target;
      main.dataset.launchStarts = String(
        Number(main.dataset.launchStarts ?? 0) + 1
      );
      for (const animation of document.getAnimations()) {
        if (
          animation instanceof CSSAnimation &&
          animation.animationName === event.animationName
        ) {
          animation.pause();
          animation.currentTime = 0;
          main.dataset.launchHeld = 'true';
        }
      }
    });
  });
});

for (const width of [1280, 390]) {
  test(`background lift leaves content usable and never restarts on frame updates at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(story);
    const main = page.locator('#main-content');
    await expect(main).toHaveAttribute('data-launch-starts', '1');
    await expect(main).toHaveAttribute('data-launch-held', 'true');
    const initialBox = await main.boundingBox();
    const initial = await main.evaluate(element => {
      const paint = getComputedStyle(element, '::after');
      return {
        contentOpacity: getComputedStyle(element).opacity,
        paintOpacity: paint.opacity,
        pointerEvents: paint.pointerEvents,
        zIndex: Number(paint.zIndex),
        duration: Number.parseFloat(paint.animationDuration),
      };
    });
    expect(initial.contentOpacity).toBe('1');
    expect(initial.paintOpacity).toBe('1');
    expect(initial.pointerEvents).toBe('none');
    expect(initial.zIndex).toBeLessThan(0);
    expect(initial.duration).toBeGreaterThan(0);
    expect(initial.duration).toBeLessThanOrEqual(0.25);
    const a11y = await new AxeBuilder({ page })
      .include('#storybook-root')
      .options(wcag22AaAxeOptions())
      .analyze();
    expect(a11y.violations).toEqual([]);

    const notes = page.getByRole('textbox', { name: 'Notes' });
    await notes.click();
    await notes.press('End');
    await notes.pressSequentially(' saved');
    await expect(notes).toHaveValue('Keep this draft saved');
    await expect(notes).toBeFocused();
    await expect(main).toHaveAttribute('data-launch-starts', '1');
    expect(await main.boundingBox()).toEqual(initialBox);

    await main.evaluate(async element => {
      const name = getComputedStyle(element, '::after').animationName;
      const animation = document
        .getAnimations()
        .find(
          item => item instanceof CSSAnimation && item.animationName === name
        );
      if (!animation) throw new Error('Launch animation missing');
      animation.play();
      await animation.finished;
      element.dataset.launchFinished = 'true';
    });
    await expect(main).toHaveAttribute('data-launch-finished', 'true');
    expect(
      await main.evaluate(
        element => getComputedStyle(element, '::after').opacity
      )
    ).toBe('0');

    // Route slots/wash change on the persistent frame. This is component
    // navigation evidence, not an authenticated Next.js route journey.
    await page.getByRole('button', { name: 'Open chat' }).click();
    await expect(
      page.getByText('Your conversation', { exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Open library' }).click();
    await expect(page.getByText('Your library', { exact: true })).toBeVisible();
    await expect(main).toHaveAttribute('data-launch-finished', 'true');
    await expect(main).toHaveAttribute('data-launch-starts', '1');
    await expect(notes).toHaveValue('Keep this draft saved');
    await page.getByRole('button', { name: 'Open Ovie' }).click();
    expect(
      await main.evaluate(
        element => getComputedStyle(element, '::after').backgroundImage
      )
    ).toBe('none');
    await page.getByRole('button', { name: 'Return to Jovie' }).click();
    await expect(main).toHaveAttribute('data-launch-starts', '1');
    await expect(main).toHaveAttribute('data-launch-finished', 'true');
    expect(await main.boundingBox()).toEqual(initialBox);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      )
    ).toBeLessThanOrEqual(0);
  });

  test(`reduced motion paints the resting shell immediately at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(story);
    const main = page.locator('#main-content');
    await expect(main).toBeVisible();
    expect(
      await main.evaluate(
        element => getComputedStyle(element, '::after').animationName
      )
    ).toBe('none');
    await expect(main).not.toHaveAttribute('data-launch-starts');
    await page
      .getByRole('textbox', { name: 'Notes' })
      .fill('Reduced motion draft');
    await expect(page.getByRole('textbox', { name: 'Notes' })).toHaveValue(
      'Reduced motion draft'
    );
  });

  test(`light theme has no launch shading at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => {
      localStorage.setItem('jovie-theme-storybook', 'light');
    });
    await page.goto(story);
    const main = page.locator('#main-content');
    await expect(main).toBeVisible();
    expect(
      await main.evaluate(
        element => getComputedStyle(element, '::after').animationName
      )
    ).toBe('none');
    await expect(main).not.toHaveAttribute('data-launch-starts');
    const a11y = await new AxeBuilder({ page })
      .include('#storybook-root')
      .options(wcag22AaAxeOptions())
      .analyze();
    expect(a11y.violations).toEqual([]);
  });
}
