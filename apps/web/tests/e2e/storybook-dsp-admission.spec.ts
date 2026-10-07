import { expect, test } from '@playwright/test';
import { runDspInteraction } from './utils/public-surface-helpers';

test('audits every service available through the real music dial', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=release-musicservicedial--three-services&viewMode=story'
  );
  await expect(page.locator('[data-dsp-provider="spotify"]')).toBeVisible();
  await page.evaluate(() => {
    const selections: string[] = [];
    Object.assign(globalThis, { __dspSelections: selections });
    new MutationObserver(records => {
      for (const record of records) {
        if (record.oldValue) selections.push(record.oldValue);
      }
    }).observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-dsp-provider'],
      attributeOldValue: true,
    });
  });
  await expect(runDspInteraction(page)).resolves.toBe(true);
  await expect(page.locator('[data-dsp-provider="spotify"]')).toBeVisible();
  const selections = await page.evaluate(
    () =>
      (globalThis as typeof globalThis & { __dspSelections: string[] })
        .__dspSelections
  );
  expect([...new Set(selections)].sort()).toEqual([
    'apple_music',
    'deezer',
    'spotify',
  ]);
});

test('rejects a Spotify-only dial instead of relaxing DSP admission', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=release-musicservicedial--one-service&viewMode=story'
  );
  await expect(page.locator('[data-dsp-provider="spotify"]')).toBeVisible();
  await expect(runDspInteraction(page)).rejects.toThrow(
    'DSP admission must exercise at least one non-Spotify provider'
  );
});

test('continues to admit static DSP links', async ({ page }) => {
  await page.setContent(`
    <a data-dsp-provider="spotify" href="https://open.spotify.com/track/123"
       target="_blank" rel="noopener noreferrer">Spotify</a>
    <a data-dsp-provider="apple_music" href="https://music.apple.com/us/album/123"
       target="_blank" rel="noopener noreferrer">Apple Music</a>
  `);
  await expect(runDspInteraction(page)).resolves.toBe(true);
});

test('audits music actions beside generic platform links', async ({ page }) => {
  await page.setContent(`
    <a data-dsp-provider="link_instagram" href="https://instagram.com/artist"
       target="_blank" rel="noopener noreferrer">Instagram</a>
    <a data-dsp-provider="spotify" href="https://open.spotify.com/track/123"
       target="_blank" rel="noopener noreferrer">Spotify</a>
    <a data-dsp-provider="apple_music" href="https://music.apple.com/us/album/123"
       target="_blank" rel="noopener noreferrer">Apple Music</a>
  `);
  await expect(runDspInteraction(page)).resolves.toBe(true);
});

test('generic platform links do not satisfy non-Spotify admission', async ({
  page,
}) => {
  await page.setContent(`
    <a data-dsp-provider="spotify" href="https://open.spotify.com/track/123"
       target="_blank" rel="noopener noreferrer">Spotify</a>
    <a data-dsp-provider="link_instagram" href="https://instagram.com/artist"
       target="_blank" rel="noopener noreferrer">Instagram</a>
  `);
  await expect(runDspInteraction(page)).rejects.toThrow(
    'DSP admission must exercise at least one non-Spotify provider'
  );
});

test('still rejects an unknown music provider', async ({ page }) => {
  await page.setContent(`
    <a data-dsp-provider="spotify" href="https://open.spotify.com/track/123"
       target="_blank" rel="noopener noreferrer">Spotify</a>
    <a data-dsp-provider="unknown_music" href="https://untrusted.example/music"
       target="_blank" rel="noopener noreferrer">Unknown Music</a>
  `);
  await expect(runDspInteraction(page)).rejects.toThrow(
    'Unknown DSP provider key: unknown_music'
  );
});

test('continues to verify programmatic DSP handoffs', async ({ page }) => {
  await page.setContent(`
    <button data-dsp-provider="spotify"
      onclick="window.open('https://open.spotify.com/track/123', '_blank', 'noopener,noreferrer')">Spotify</button>
    <button data-dsp-provider="apple_music"
      onclick="window.open('https://music.apple.com/us/album/123', '_blank', 'noopener,noreferrer')">Apple Music</button>
  `);
  await expect(runDspInteraction(page)).resolves.toBe(true);
});

test('rejects an unsafe non-Spotify handoff', async ({ page }) => {
  await page.goto(
    '/iframe.html?id=release-musicservicedial--three-services&viewMode=story'
  );
  await expect(page.locator('[data-dsp-provider="spotify"]')).toBeVisible();
  await page.getByRole('button', { name: 'Select Apple Music' }).click();
  const action = page.locator('[data-dsp-provider="apple_music"]');
  await expect(action).toBeVisible();
  await action.evaluate(element =>
    element.setAttribute('href', 'https://untrusted.example/music')
  );
  await expect(runDspInteraction(page)).rejects.toThrow(
    'DSP handoff host is not canonical for apple_music'
  );
});
