import { expect, type Locator, type Page, test } from '@playwright/test';

const story =
  '/iframe.html?id=organisms-appshellframe--occupied-context-inspector&viewMode=story';

async function openStory(page: Page, width: number) {
  await page.setViewportSize({ width, height: 780 });
  await page.goto(story);
  const notes = page.getByRole('textbox', { name: 'Notes', exact: true });
  const toggle = page.locator('[data-rail-toggle="right"]');
  await expect(toggle).toBeVisible({ timeout: 90_000 });
  return { notes, toggle, drawer: page.getByTestId('story-inspector') };
}

async function expectComposerEdgeReachable(notes: Locator) {
  expect(
    await notes.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return (
        document.elementFromPoint(
          rect.right - 6,
          rect.top + rect.height / 2
        ) === element
      );
    })
  ).toBe(true);
}

export function registerOccupiedRightRailTest() {
  for (const width of [1024, 1440]) {
    test(`occupied chat context never floats over the composer on hover or focus at ${width}px`, async ({
      page,
    }) => {
      const { notes, toggle, drawer } = await openStory(page, width);
      const context = page.getByTestId('story-chat-rail-context');
      const main = page.getByRole('main');
      await expect(context).toBeVisible();
      await notes.fill('Unsent draft');
      const initial = await main.boundingBox();
      if (!initial) throw new Error('Expected the composer route bounding box');
      expect(initial.width).toBeGreaterThanOrEqual(320);
      await page.clock.install();

      await toggle.hover();
      await page.clock.runFor(450);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.focus();
      await page.clock.runFor(450);
      await expect(toggle).toBeFocused();
      await expect(drawer).toHaveAttribute('data-rail-phase', 'closed');
      expect(await main.boundingBox()).toEqual(initial);
      const contextBox = await context.boundingBox();
      if (!contextBox)
        throw new Error('Expected the chat context bounding box');
      expect(initial.x + initial.width).toBeLessThanOrEqual(contextBox.x + 0.5);
      await expectComposerEdgeReachable(notes);
      await expect(notes).toHaveValue('Unsent draft');

      await toggle.press('Enter');
      await page.clock.runFor(450);
      await expect(drawer).toHaveAttribute('data-rail-phase', 'open');
      await expect(drawer).toHaveAttribute('data-rail-presentation', 'push');
      expect((await main.boundingBox())?.width).toBeGreaterThanOrEqual(320);
      await expectComposerEdgeReachable(notes);
      await expect(notes).toHaveValue('Unsent draft');
    });
  }

  test('streamed release context takes the in-flow slot before an open passive profile rail closes', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 780 });
    await page.goto(
      '/iframe.html?id=organisms-appshellframe--preview-overlay-inspector&viewMode=story'
    );
    const toggle = page.locator('[data-rail-toggle="right"]');
    const notes = page.getByRole('textbox', { name: 'Notes', exact: true });
    const drawer = page.getByTestId('story-inspector');
    await expect(toggle).toBeVisible({ timeout: 90_000 });
    await notes.fill('Unsent draft');
    await toggle.focus();
    await expect(drawer).toHaveAttribute('data-rail-presentation', 'overlay');
    await expect(drawer).toHaveAttribute('data-rail-phase', 'open');

    const firstOccupiedLayout = await page.evaluate(
      () =>
        new Promise<{
          routeRight: number;
          contextLeft: number;
          placement: string | null;
          modal: string | null;
        }>(resolve => {
          const observer = new MutationObserver(() => {
            const main = document.querySelector('main');
            const context = document.querySelector(
              '[data-testid="story-chat-rail-context"]'
            );
            const drawer = document.getElementById('story-inspector');
            if (!main || !context || !drawer) return;
            observer.disconnect();
            resolve({
              routeRight: main.getBoundingClientRect().right,
              contextLeft: context.getBoundingClientRect().left,
              placement: drawer.getAttribute('data-rail-presentation'),
              modal: drawer.getAttribute('aria-modal'),
            });
          });
          observer.observe(document.body, { childList: true, subtree: true });
          window.dispatchEvent(new Event('story-chat-context-arrives'));
        })
    );
    expect(firstOccupiedLayout.placement).toBe('push');
    expect(firstOccupiedLayout.modal).toBeNull();
    expect(firstOccupiedLayout.routeRight).toBeLessThanOrEqual(
      firstOccupiedLayout.contextLeft + 0.5
    );
    await expect(drawer).toHaveAttribute('data-rail-phase', 'closed');
    await expect(toggle).toBeFocused();
    await expectComposerEdgeReachable(notes);
    await expect(notes).toHaveValue('Unsent draft');
  });

  for (const width of [320, 390, 1023]) {
    test(`explicit right rail at ${width}px keeps the modal adapter and recovers the draft`, async ({
      page,
    }) => {
      const { notes, toggle, drawer } = await openStory(page, width);
      await expect(page.getByTestId('story-chat-rail-context')).toBeHidden();
      await expect(drawer).toHaveAttribute('role', 'dialog');
      await notes.fill('Unsent draft');
      await toggle.focus();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.press('Enter');
      await expect(drawer).toHaveAttribute('aria-modal', 'true');
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveAttribute('aria-hidden', 'true');
      await expect(toggle).toBeFocused();
      await notes.focus();
      await expect(notes).toBeFocused();
      await expect(notes).toHaveValue('Unsent draft');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth
        )
      ).toBeLessThanOrEqual(0);
    });
  }
}
