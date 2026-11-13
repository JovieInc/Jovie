import { expect, type Page, test } from '@playwright/test';

const STORY = 'organisms-desktopupdatecontrol';
const STATES = [
  'checking',
  'available',
  'downloading',
  'ready',
  'restarting',
  'failed',
  'failed',
  'offline',
] as const;
const THEMES = [
  ['dark', `${STORY}--all-states`],
  ['light', `${STORY}--all-states-light`],
] as const;

async function openGallery(page: Page, story: string) {
  await page.goto(`/iframe.html?id=${story}&viewMode=story`);
  await expect(page.locator('[data-update-control-gallery]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test.describe('Desktop update control', () => {
  for (const [theme, story] of THEMES) {
    test(`renders every state in one footprint (${theme})`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      // A theme saved by an earlier story must not leak into this capture.
      await page.addInitScript(() =>
        localStorage.removeItem('jovie-theme-storybook')
      );
      await openGallery(page, story);
      await expect(page.locator('html')).toHaveClass(new RegExp(theme));

      const controls = page.locator('[data-desktop-update-control]');
      await expect(controls).toHaveCount(STATES.length);
      expect(
        await controls.evaluateAll(nodes =>
          nodes.map(node => node.getAttribute('data-state'))
        )
      ).toEqual([...STATES]);

      // Zero layout shift between states: every state paints the same row
      // and the same button box, so swapping one for another moves nothing.
      const geometry = await controls.evaluateAll(nodes =>
        nodes.map(node => {
          const row = node.getBoundingClientRect();
          const button = node.querySelector('button')?.getBoundingClientRect();
          const status = node.querySelector<HTMLElement>(
            '[data-part="status"]'
          );
          return {
            width: row.width,
            height: row.height,
            buttonWidth: button?.width ?? -1,
            buttonHeight: button?.height ?? -1,
            buttonOffset: button ? button.left - row.left : -1,
            clipped: status ? status.scrollWidth > status.clientWidth : true,
          };
        })
      );
      const [first] = geometry;
      expect(first).toBeTruthy();
      expect(first?.height).toBe(36);
      for (const box of geometry) {
        expect(box.width).toBe(first?.width);
        expect(box.height).toBe(first?.height);
        expect(box.buttonWidth).toBe(first?.buttonWidth);
        expect(box.buttonHeight).toBe(first?.buttonHeight);
        expect(box.buttonOffset).toBe(first?.buttonOffset);
        // Every status fits the expanded rail without truncating.
        expect(box.clipped).toBe(false);
      }

      await expect(
        page.locator('[data-state="downloading"] [data-part="status"]')
      ).toHaveText('Downloading 100%');
      await expect(
        page.getByRole('progressbar', { name: 'Download Progress' })
      ).toHaveCount(1);

      await testInfo.attach(`desktop-update-control-${theme}.png`, {
        body: await page
          .locator('[data-update-control-gallery]')
          .screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
      });
    });
  }

  test('keeps the slot still across a scripted updater run', async ({
    page,
  }) => {
    await page.goto(`/iframe.html?id=${STORY}--lifecycle&viewMode=story`);
    const slot = page.locator('[data-update-control-slot]');
    await expect(slot).toBeVisible();
    const initial = await slot.boundingBox();
    expect(initial).not.toBeNull();

    const seen = new Set<string>();
    const control = page.locator('[data-desktop-update-control]');
    // The story steps the real reducer every 1.4s; sample past one full loop.
    for (let sample = 0; sample < 60 && seen.size < 7; sample += 1) {
      const state = await control
        .getAttribute('data-state', { timeout: 500 })
        .catch(() => null);
      if (state) seen.add(state);
      expect(await slot.boundingBox()).toEqual(initial);
      await page.waitForTimeout(500);
    }
    expect([...seen].sort()).toEqual(
      [
        'available',
        'checking',
        'downloading',
        'failed',
        'offline',
        'ready',
        'restarting',
      ].sort()
    );
  });

  test('drops the transition under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/iframe.html?id=${STORY}--downloading&viewMode=story`);
    const status = page.locator('[data-part="status"]');
    await expect(status).toHaveText('Downloading 42%');
    expect(
      await status.evaluate(node => getComputedStyle(node).transitionProperty)
    ).toBe('none');
  });

  test('fades a new state in with the subtle motion token', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`/iframe.html?id=${STORY}--ready&viewMode=story`);
    const status = page.locator('[data-part="status"]');
    await expect(status).toHaveText('Update Ready');
    const motion = await status.evaluate(node => {
      const style = getComputedStyle(node);
      const token = getComputedStyle(document.documentElement)
        .getPropertyValue('--duration-subtle')
        .trim();
      const probe = document.createElement('i');
      probe.style.transitionDuration = token;
      document.body.append(probe);
      const expected = getComputedStyle(probe).transitionDuration;
      probe.remove();
      return {
        property: style.transitionProperty,
        duration: style.transitionDuration,
        expected,
      };
    });
    expect(motion.property).toBe('opacity');
    expect(motion.duration).toBe(motion.expected);
  });
});
