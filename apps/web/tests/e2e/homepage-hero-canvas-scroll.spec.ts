import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import ts from 'typescript';
import { HERO_CANVAS_SCROLL_RANGE } from '@/components/homepage/hero-light/hero-light-scroll';
import { jovieMarkAtSize } from '@/lib/brand/tokens';

const webRoot = join(__dirname, '../..');
const shotDir = existsSync('/opt/cursor/artifacts')
  ? '/opt/cursor/artifacts'
  : join(webRoot, 'test-results/hero-canvas');

const lightCss = readFileSync(
  join(webRoot, 'components/homepage/hero-light/HomepageHeroLight.css'),
  'utf8'
);
const canvasCss = readFileSync(
  join(webRoot, 'components/homepage/hero-light/HomepageHeroCanvas.css'),
  'utf8'
);
const mark = jovieMarkAtSize(28);

function canvasHtml(fallback: boolean): string {
  return `<!doctype html>
<html class="dark">
  <head>
    <meta charset="utf-8" />
    <style>
      @font-face {
        font-family: Satoshi;
        src: url("file://${join(webRoot, 'public/fonts/Satoshi-Variable.woff2')}") format("woff2");
        font-weight: 300 900;
        font-display: swap;
      }
      ${lightCss}
      ${canvasCss}
      html, body { margin: 0; background: #030406; color: #f5f7fb; }
      .homepage-hero-canvas__headline {
        font-family: Satoshi, sans-serif;
        font-size: clamp(2.25rem, 4.6vw, 3.5rem);
        font-weight: 500;
        letter-spacing: -0.03em;
        line-height: 1.08;
      }
      .homepage-hero-canvas__claim-field {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 3rem;
        padding: 0.25rem 0.25rem 0.25rem 1rem;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 999px;
        background: #131417;
      }
      .homepage-hero-canvas__claim-field input {
        flex: 1;
        min-width: 0;
        border: 0;
        background: transparent;
        color: #f5f7fb;
        font: 500 1rem/1 Satoshi, sans-serif;
      }
      .homepage-hero-canvas__claim-field button {
        border: 0;
        border-radius: 999px;
        background: #f5f7fb;
        color: #030406;
        padding: 0.55rem 0.9rem;
        font: 500 0.95rem/1 Satoshi, sans-serif;
      }
      .spacer { height: 200vh; }
      ${fallback ? '.homepage-hero-canvas { animation: none !important; }' : ''}
    </style>
  </head>
  <body>
    <section class="homepage-hero-canvas" ${fallback ? 'data-hero-canvas-scroll="fallback"' : ''}>
      <header class="homepage-hero-canvas__bar">
        <div class="homepage-hero-canvas__bar-plate">
          <a class="homepage-hero-canvas__brand" href="/" aria-label="Jovie">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="${mark.viewBox}" width="28" height="28" fill="currentColor" aria-hidden="true">
              <path d="${mark.d}" />
            </svg>
          </a>
          <form class="homepage-hero-canvas__claim">
            <div class="homepage-hero-canvas__claim-field">
              <span>jov.ie/</span>
              <input aria-label="Handle" value="you" readonly />
              <button type="button">Claim</button>
            </div>
          </form>
          <a class="homepage-hero-canvas__sign-in" href="/signin">Sign in</a>
        </div>
      </header>
      <div class="homepage-hero-canvas__stage">
        <div class="homepage-hero-canvas__field">
          <div class="homepage-hero-light" aria-hidden="true" data-renderer="css" data-live="false">
            <div class="homepage-hero-light__wash"></div>
            <div class="homepage-hero-light__grid"></div>
            <div class="homepage-hero-light__focus"><div class="homepage-hero-light__edge"></div></div>
          </div>
          <div class="homepage-hero-canvas__copy">
            <h1 class="homepage-hero-canvas__headline">One profile. For every fan.</h1>
          </div>
        </div>
        <div class="homepage-hero-canvas__logos homepage-hero-canvas__logos-rail"></div>
      </div>
    </section>
    <div class="spacer"></div>
  </body>
</html>`;
}

async function readScroll(
  page: Page
): Promise<{ y: number; progress: number }> {
  return page.evaluate(() => {
    const root = document.querySelector('.homepage-hero-canvas');
    const raw = root
      ? getComputedStyle(root).getPropertyValue('--hero-canvas-progress')
      : '0';
    return { y: window.scrollY, progress: Number(raw) || 0 };
  });
}

test.describe('homepage hero canvas scroll', () => {
  test('native scroll advances 1:1 with wheel input and reverses', async ({
    page,
  }) => {
    await page.setContent(canvasHtml(false), { waitUntil: 'load' });
    await page.mouse.move(720, 420);

    const start = await readScroll(page);
    expect(start.y).toBe(0);
    expect(start.progress).toBeLessThan(0.05);

    await page.mouse.wheel(0, 160);
    await page.evaluate(
      () =>
        new Promise<void>(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        })
    );
    const forward = await readScroll(page);
    expect(forward.y).toBeGreaterThanOrEqual(150);
    expect(forward.y).toBeLessThanOrEqual(170);
    expect(forward.progress).toBeGreaterThan(0.05);

    await page.mouse.wheel(0, -160);
    await page.evaluate(
      () =>
        new Promise<void>(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        })
    );
    const back = await readScroll(page);
    expect(back.y).toBeLessThan(forward.y);
    expect(back.progress).toBeLessThanOrEqual(forward.progress);
    expect(back.y).toBeLessThanOrEqual(20);
  });

  test('the passive fallback follows scroll position and reverses', async ({
    page,
  }) => {
    const source = readFileSync(
      join(webRoot, 'components/homepage/hero-light/hero-light-scroll.ts'),
      'utf8'
    );
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        removeComments: true,
      },
    });
    const script = `${outputText.replace(/^export /gm, '')}
      globalThis.HeroCanvasScroll = {
        bindHeroCanvasScroll,
        heroCanvasScrollProgress,
        heroCanvasScrollRange,
      };`;
    await page.setContent(canvasHtml(true), { waitUntil: 'load' });
    await page.addScriptTag({ content: script });
    await page.evaluate(() => {
      const root = document.querySelector('.homepage-hero-canvas');
      if (!(root instanceof HTMLElement)) throw new Error('missing canvas');
      const scroll = (
        window as Window & {
          HeroCanvasScroll: {
            bindHeroCanvasScroll(node: HTMLElement): () => void;
          };
        }
      ).HeroCanvasScroll;
      scroll.bindHeroCanvasScroll(root);
    });

    await page.mouse.move(200, 200);
    await page.mouse.wheel(0, 200);
    await page.evaluate(
      () =>
        new Promise<void>(resolve => {
          requestAnimationFrame(() => resolve());
        })
    );
    const forward = await readScroll(page);
    const viewportHeight = page.viewportSize()?.height ?? 0;
    const expected = Math.min(
      1,
      forward.y / (viewportHeight * HERO_CANVAS_SCROLL_RANGE)
    );
    expect(forward.y).toBeGreaterThanOrEqual(190);
    expect(forward.y).toBeLessThanOrEqual(210);
    expect(forward.progress).toBeCloseTo(expected, 2);

    await page.mouse.wheel(0, -200);
    await page.evaluate(
      () =>
        new Promise<void>(resolve => {
          requestAnimationFrame(() => resolve());
        })
    );
    const back = await readScroll(page);
    expect(back.y).toBeLessThan(forward.y);
    expect(back.progress).toBeLessThan(forward.progress);
  });

  test('captures dark progress frames at 1440 and 390', async ({ page }) => {
    mkdirSync(shotDir, { recursive: true });
    await page.setContent(canvasHtml(false), { waitUntil: 'load' });
    await page.addStyleTag({
      content: '.homepage-hero-light__edge { animation: none; }',
    });

    const viewports = [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ] as const;
    for (const viewport of viewports) {
      await page.setViewportSize({ ...viewport });
      const range = viewport.height * HERO_CANVAS_SCROLL_RANGE;
      for (const progress of [0, 0.5, 1] as const) {
        await page.evaluate(y => window.scrollTo(0, y), range * progress);
        await page.evaluate(
          () =>
            new Promise<void>(resolve => {
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve())
              );
            })
        );
        const label = progress === 0.5 ? 'p05' : `p${progress}`;
        await page.screenshot({
          path: join(shotDir, `hero-canvas-${viewport.width}-${label}.png`),
        });
        const reading = await readScroll(page);
        expect(reading.progress).toBeCloseTo(progress, 1);
      }
    }
  });
});
