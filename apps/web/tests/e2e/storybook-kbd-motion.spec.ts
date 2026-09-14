import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const evidenceDir = join('test-results', 'storybook-kbd-motion-evidence');

async function sampleFrames(page: Page) {
  return page.evaluate(async () => {
    const frames: Array<{
      width: number;
      height: number;
      opacity: number;
      keyWidths: number[];
    }> = [];
    const started = performance.now();
    await new Promise<void>(resolve => {
      function sample() {
        const tip = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-testid="tooltip-content"]'
          )
        ).find(element =>
          element.querySelector('[data-testid="kbd-tooltip-shortcut"]')
        );
        if (tip) {
          const rect = tip.getBoundingClientRect();
          frames.push({
            width: rect.width,
            height: rect.height,
            opacity: Number(getComputedStyle(tip).opacity),
            keyWidths: Array.from(tip.querySelectorAll('kbd')).map(
              key => key.getBoundingClientRect().width
            ),
          });
        }
        if (performance.now() - started < 350) requestAnimationFrame(sample);
        else resolve();
      }
      requestAnimationFrame(sample);
    });
    return frames;
  });
}

test.describe('Kbd real Tooltip motion', () => {
  test.describe.configure({ retries: 0, timeout: 90_000 });
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      test(`${theme}, ${reducedMotion}: focus, hover and reversal`, async ({
        page,
      }, testInfo) => {
        const errors: string[] = [];
        let completed = false;
        const traces: Record<
          string,
          Awaited<ReturnType<typeof sampleFrames>>
        > = {};
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewportSize({ width: 390, height: 844 });
        await page.emulateMedia({ reducedMotion, colorScheme: theme });
        await page.addInitScript(value => {
          localStorage.setItem('jovie-theme-storybook', value);
        }, theme);
        try {
          await page.goto(
            '/iframe.html?id=ui-atoms-kbd--tooltip-composition&viewMode=story&__jovie_motion=live',
            { waitUntil: 'domcontentloaded', timeout: 45_000 }
          );
          const long = page.getByTestId('kbd-tooltip-long-trigger');
          const short = page.getByTestId('kbd-tooltip-short-trigger');
          const tip = page.getByTestId('tooltip-content').filter({
            has: page.getByTestId('kbd-tooltip-shortcut'),
          });
          await expect(long).toBeVisible();
          await expect(page.locator('html')).toHaveClass(
            new RegExp(`\\b${theme}\\b`)
          );
          await expect(
            page.locator('[data-jovie-storybook-fixtures]')
          ).toHaveCount(0);
          expect(
            await page.evaluate(
              () => matchMedia('(prefers-reduced-motion: reduce)').matches
            )
          ).toBe(reducedMotion === 'reduce');
          await page.evaluate(() => document.fonts.ready);

          // Close the story's initially open composition, then use real keys.
          await long.focus();
          await page.keyboard.press('Escape');
          await expect(tip).toBeHidden();
          await short.focus();
          await page.keyboard.press('Tab');
          await expect(long).toBeFocused();
          await expect(tip).toBeVisible();
          traces.keyboardOpen = await sampleFrames(page);
          await page.keyboard.press('Escape');
          await expect(tip).toBeHidden();

          await long.blur();
          await long.hover();
          await expect(tip).toBeVisible();
          traces.hoverOpen = await sampleFrames(page);
          await page.mouse.move(1, 1);
          await expect(tip).toBeHidden();

          // Reverse pointer intent without sleeping through the transition.
          await long.hover();
          await page.mouse.move(1, 1);
          await long.hover();
          await expect(tip).toBeVisible();
          traces.reversal = await sampleFrames(page);
          await page.mouse.move(1, 1);
          await expect(tip).toBeHidden();
          await short.focus();
          await page.keyboard.press('Tab');
          await expect(long).toBeFocused();
          await expect(tip).toBeVisible();
          await page.keyboard.press('Shift+Tab');
          await expect(short).toBeFocused();
          await expect(tip).toBeHidden();

          for (const frames of Object.values(traces)) {
            expect(frames.length).toBeGreaterThan(2);
            const first = frames[0];
            for (const frame of frames) {
              expect(Math.abs(frame.width - first.width)).toBeLessThanOrEqual(
                1
              );
              expect(Math.abs(frame.height - first.height)).toBeLessThanOrEqual(
                1
              );
              expect(frame.keyWidths).toHaveLength(3);
              frame.keyWidths.forEach((width, index) => {
                expect(
                  Math.abs(width - first.keyWidths[index])
                ).toBeLessThanOrEqual(1);
              });
            }
            expect(frames.at(-1)?.opacity).toBeGreaterThanOrEqual(0.99);
          }
          expect(errors).toEqual([]);
          completed = true;
        } finally {
          const body = JSON.stringify(
            {
              revision,
              theme,
              reducedMotion,
              completed,
              errors,
              traces,
            },
            null,
            2
          );
          await mkdir(evidenceDir, { recursive: true });
          await writeFile(
            join(evidenceDir, `${theme}-${reducedMotion}.json`),
            body
          );
          await testInfo.attach('kbd-motion', {
            body,
            contentType: 'application/json',
          });
        }
      });
    }
  }
});
