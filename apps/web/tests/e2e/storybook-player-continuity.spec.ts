import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    playerAudioInstances: HTMLAudioElement[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.playerAudioInstances = [];
    window.Audio = new Proxy(window.Audio, {
      construct(target, args) {
        const audio = Reflect.construct(target, args) as HTMLAudioElement;
        window.playerAudioInstances.push(audio);
        return audio;
      },
    });
  });
  await page.route('**/player-art-*.svg', route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="white"/><rect width="40" height="40" fill="black"/></svg>',
    })
  );
  await page.goto(
    '/iframe.html?id=organisms-persistentaudiobar--continuity&viewMode=story'
  );
  await page.getByRole('button', { name: 'First track', exact: true }).click();
  await expect(page.getByTestId('continuity-state')).toContainText(
    '"duration":1'
  );
});

test('hidden waveform cannot take keyboard focus or pointer input', async ({
  page,
}, testInfo) => {
  const slider = page.getByRole('slider', {
    name: 'Seek Track Waveform',
    includeHidden: true,
  });
  await slider.evaluate(node => (node as HTMLElement).focus());
  await page.screenshot({ path: testInfo.outputPath('waveform.png') });
  await expect(slider).not.toBeFocused();
  expect(
    await slider.evaluate(node =>
      node.closest('[aria-hidden]')?.hasAttribute('inert')
    )
  ).toBe(true);
});

test('minimize and expand hand focus to the remaining player without recreating audio', async ({
  page,
}, testInfo) => {
  const hide = page.getByRole('button', { name: 'Hide Player', exact: true });
  await hide.focus();
  await page.keyboard.press('Enter');
  const show = page.getByRole('button', { name: 'Show Player', exact: true });
  await page.screenshot({ path: testInfo.outputPath('minimized.png') });
  await expect(show).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(hide).toBeFocused();
  await expect(
    page.locator('[data-shell-audio-surface="sidebar-compact"]')
  ).toHaveAttribute('inert', '');
  expect(await page.evaluate(() => window.playerAudioInstances.length)).toBe(1);
});

test('Space activates a focused waveform button once', async ({ page }) => {
  const show = page.getByRole('button', { name: 'Show waveform', exact: true });
  await show.focus();
  await page.keyboard.press('Space');
  await expect(
    page.getByRole('button', { name: 'Hide waveform' })
  ).toBeFocused();
  await expect(
    page.getByRole('slider', { name: 'Seek Track Waveform' })
  ).toBeVisible();
});

test('track change clears previous artwork while the next image is pending', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const image = page.locator('[data-mobile-audio-surface] img');
  await expect
    .poll(() => image.evaluate(node => (node as HTMLImageElement).complete))
    .toBe(true);
  await page.route('**/player-art-dark.svg', () => new Promise(() => {}));
  await page.getByRole('button', { name: 'Second track', exact: true }).click();
  await expect(page.getByTestId('continuity-state')).toContainText(
    '"activeTrackId":"continuity-1"'
  );
  await page.screenshot({ path: testInfo.outputPath('pending-artwork.png') });
  const paintedSource = await image.evaluate(
    node => (node as HTMLImageElement).currentSrc
  );
  expect(paintedSource).not.toContain('player-art-light.svg');
});

test('rapid presentation changes preserve engine, position, identity and sole actionable chrome', async ({
  page,
}) => {
  await page.evaluate(() => window.playerAudioInstances[0].pause());
  await page.getByRole('button', { name: 'Seek midpoint' }).click();
  await expect(page.getByTestId('continuity-state')).toContainText(
    '"currentTime":0.5'
  );
  const originalSource = await page.evaluate(
    () => window.playerAudioInstances[0].src
  );
  for (let index = 0; index < 3; index++) {
    await page
      .getByRole('button', { name: 'Hide Player', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Dismiss Player', exact: true })
    ).toHaveCount(1);
    await page
      .getByRole('button', { name: 'Show Player', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Dismiss Player', exact: true })
    ).toHaveCount(1);
  }
  await page.evaluate(() => {
    for (let index = 0; index < 6; index++) {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: '`', bubbles: true })
      );
    }
  });
  await expect(page.getByTestId('shell-audio-dock')).toHaveAttribute(
    'data-state',
    'open'
  );
  await expect(page.getByTestId('continuity-state')).toContainText(
    '"currentTime":0.5'
  );
  expect(await page.evaluate(() => window.playerAudioInstances.length)).toBe(1);
  expect(await page.evaluate(() => window.playerAudioInstances[0].src)).toBe(
    originalSource
  );
  await page.getByRole('button', { name: 'Second track', exact: true }).click();
  await expect(page.getByTestId('continuity-state')).toContainText(
    '"activeTrackId":"continuity-1"'
  );
  await page.getByRole('button', { name: 'Hide Player', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Show Player', exact: true })
  ).toContainText('A very long track title');
  await expect(
    page.locator('[data-shell-audio-surface="sidebar-compact"] img')
  ).toHaveAttribute('src', '/player-art-dark.svg');
  expect(await page.evaluate(() => window.playerAudioInstances.length)).toBe(1);
});

for (const [width, theme] of [
  [320, 'dark'],
  [390, 'light'],
  [834, 'dark'],
  [1280, 'light'],
] as const) {
  test(`artwork and long metadata keep controls usable at ${width}px in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(
      value => localStorage.setItem('jovie-theme-storybook', value),
      theme
    );
    await page.reload();
    await expect(page.locator('html')).toHaveClass(new RegExp(theme));
    await page.route('**/player-art-broken.svg', route =>
      route.fulfill({ status: 404, body: '' })
    );
    const variants = [
      ['First track', 80, 40, 'white'],
      ['Second track', 2, 1, 'black'],
      ['First track', 80, 80, 'black'],
      ['Second track', 80, 80, 'white'],
      ['No artwork', 0, 0, 'black'],
      ['Broken artwork', 0, 0, 'black'],
    ] as const;
    for (const [action, artWidth, artHeight, fill] of variants) {
      if (artWidth) {
        await page.route('**/player-art-*.svg', route =>
          route.request().url().includes('broken')
            ? route.fulfill({ status: 404, body: '' })
            : route.fulfill({
                contentType: 'image/svg+xml',
                body: `<svg xmlns="http://www.w3.org/2000/svg" width="${artWidth}" height="${artHeight}"><rect width="100%" height="100%" fill="${fill}"/></svg>`,
              })
        );
      }
      await page.getByRole('button', { name: action, exact: true }).click();
      if (width >= 1024) {
        await page
          .getByRole('button', { name: 'Hide Player', exact: true })
          .click();
      }
      const player =
        width >= 1024
          ? page.locator('[data-shell-audio-surface="sidebar-compact"]')
          : page.locator('[data-mobile-audio-surface]');
      await expect(player).toBeVisible();
      const controls = await player.getByRole('button').all();
      for (const control of controls) {
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
      for (const image of await player.locator('img').all()) {
        expect(
          await image.evaluate(node => getComputedStyle(node).objectFit)
        ).toBe('contain');
        const frame = await image.locator('..').boundingBox();
        expect(frame).toMatchObject({ width: 36, height: 36 });
      }
    }
    await page.screenshot({
      path: testInfo.outputPath(`artwork-${width}-${theme}.png`),
    });
  });
}

test('reduced motion and unavailable transition APIs settle without gating controls', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Reflect.deleteProperty(Document.prototype, 'startViewTransition');
    Object.defineProperty(navigator, 'gpu', { value: undefined });
  });
  await page.reload();
  await page.getByRole('button', { name: 'First track', exact: true }).click();
  await page.getByRole('button', { name: 'Hide Player', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Show Player', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Hide Player', exact: true })
  ).toBeFocused();
  await page
    .getByRole('button', { name: 'Show waveform', exact: true })
    .click();
  await expect(
    page.getByRole('slider', { name: 'Seek Track Waveform' })
  ).toBeVisible();
  expect(await page.evaluate(() => window.playerAudioInstances.length)).toBe(1);
});

test('mobile seek and play targets stay separate at 320px', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const slider = await page
    .getByRole('slider', { name: 'Seek track', exact: true })
    .boundingBox();
  const play = await page
    .getByRole('button', { name: /^(Pause playback|Resume playback)$/ })
    .boundingBox();
  await page.screenshot({ path: testInfo.outputPath('narrow-layout.png') });
  expect(slider).not.toBeNull();
  expect(play).not.toBeNull();
  expect(
    slider!.x + slider!.width <= play!.x || slider!.y >= play!.y + play!.height
  ).toBe(true);
});

for (const state of ['empty-focused', 'populated-focused']) {
  test(`lyrics ${state} owns route-entry focus`, async ({ page }, testInfo) => {
    await page.goto(
      `/iframe.html?id=shell-lyricsview--${state}&viewMode=story`
    );
    await expect(
      page.getByRole('region', { name: 'Lyrics', exact: true })
    ).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`lyrics-${state}.png`) });
  });
}

test.describe('touch player', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('touch transport stays usable after a track change', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Second track', exact: true }).tap();
    const play = page.getByRole('button', {
      name: 'Pause playback',
      exact: true,
    });
    await expect(
      page.getByRole('slider', { name: 'Seek track', exact: true })
    ).toBeEnabled();
    await play.tap();
    await expect
      .poll(() => page.evaluate(() => window.playerAudioInstances[0].paused))
      .toBe(true);
    await page.getByRole('slider', { name: 'Seek track', exact: true }).tap();
    expect(await page.evaluate(() => window.playerAudioInstances.length)).toBe(
      1
    );
  });
});

test('200 percent zoom preserves separate visible transport targets', async ({
  page,
}, testInfo) => {
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  const play = page.getByRole('button', {
    name: /^(Pause playback|Resume playback|Play \(space\)|Pause \(space\))$/,
  });
  await expect(play).toBeVisible();
  const box = await play.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(1280);
  await play.click();
  expect(await page.evaluate(() => window.playerAudioInstances.length)).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('zoom-200.png') });
});
