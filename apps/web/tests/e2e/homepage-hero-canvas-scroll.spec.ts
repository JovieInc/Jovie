import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import ts from 'typescript';
import { HERO_CANVAS_SCROLL_RANGE } from '@/components/homepage/hero-light/hero-light-scroll';
import { HOMEPAGE_COPY } from '@/data/homepageCopy';
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
      *, *::before, *::after { box-sizing: border-box; }
      html, body { margin: 0; background: #030406; color: #f5f7fb; }
      .homepage-hero-canvas__headline {
        font-family: Satoshi, sans-serif;
        font-size: clamp(2.25rem, 4.6vw, 3.5rem);
        font-weight: 500;
        letter-spacing: -0.03em;
        line-height: 1.08;
      }
      .homepage-hero-canvas__subhead {
        font-family: Satoshi, sans-serif;
        font-size: 1.0625rem;
        font-weight: 450;
        line-height: 1.5;
        letter-spacing: -0.006em;
        max-width: 36rem;
      }
      .homepage-hero-canvas__support {
        font-family: Satoshi, sans-serif;
        font-size: 0.875rem;
        font-weight: 450;
        line-height: 1.45;
        color: #a8b0c3;
        max-width: 36rem;
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
      /* Quiet phone mock: bezel-free mobile web screen at the real 402/874
         aspect (components/marketing/device/DeviceScreen.css). Skeleton
         structure only — no invented profile content. */
      .ap-phone-frame { width: 100%; }
      .mobile-web-screen {
        position: relative;
        width: 100%;
        aspect-ratio: 402 / 874;
        overflow: hidden;
        border: 1px solid rgba(168, 176, 195, 0.16);
        border-radius: 1.25rem;
        background: #070b12;
      }
      .phone-skel { position: absolute; inset: 0; padding: 9% 8%; }
      .phone-skel__bar {
        height: 4.5%;
        border-radius: 999px;
        background: rgba(168, 176, 195, 0.14);
        margin-bottom: 6%;
      }
      .phone-skel__bar--w60 { width: 60%; }
      .phone-skel__bar--w80 { width: 80%; }
      .phone-skel__cover {
        aspect-ratio: 1;
        border-radius: 0.75rem;
        background: rgba(168, 176, 195, 0.1);
        margin-bottom: 8%;
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
            <h1 class="homepage-hero-canvas__headline">${HOMEPAGE_COPY.hero.headline}</h1>
            <p class="homepage-hero-canvas__subhead">${HOMEPAGE_COPY.hero.subhead}</p>
            <p class="homepage-hero-canvas__support">${HOMEPAGE_COPY.hero.supportNote}</p>
          </div>
          <div class="homepage-hero-canvas__proof">
            <div class="ap-phone-frame homepage-artist-hero__phone">
              <div class="mobile-web-screen">
                <div class="phone-skel">
                  <div class="phone-skel__bar phone-skel__bar--w60"></div>
                  <div class="phone-skel__cover"></div>
                  <div class="phone-skel__bar phone-skel__bar--w80"></div>
                  <div class="phone-skel__bar phone-skel__bar--w60"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    <div class="spacer"></div>
  </body>
</html>`;
}

/** The passive fallback script, transpiled once from the product source. */
const heroScrollScript = (() => {
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
  return `${outputText.replace(/^export /gm, '')}
    globalThis.HeroCanvasScroll = {
      bindHeroCanvasScroll,
      heroCanvasScrollProgress,
      heroCanvasScrollRange,
    };`;
})();

async function bindPassiveFallback(page: Page): Promise<void> {
  await page.addScriptTag({ content: heroScrollScript });
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
}

/**
 * Product parity for the progress driver. The shipped component binds the
 * passive JS fallback whenever the browser has no native scroll-driven
 * animations, so `--hero-canvas-progress` always follows document scroll.
 * The harness must do the same in the non-fallback tests, or browsers
 * without `animation-timeline: scroll()` support never advance the
 * variable (the CSS animation is skipped by @supports and nothing runs).
 */
async function bindProgressDriver(page: Page): Promise<void> {
  const native = await page.evaluate(() =>
    Boolean(window.CSS?.supports?.('animation-timeline: scroll()'))
  );
  if (!native) await bindPassiveFallback(page);
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
    await bindProgressDriver(page);
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
    await page.setContent(canvasHtml(true), { waitUntil: 'load' });
    await bindPassiveFallback(page);

    await page.mouse.move(200, 200);
    await page.mouse.wheel(0, 200);
    await page.evaluate(
      () =>
        new Promise<void>(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
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
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        })
    );
    const back = await readScroll(page);
    expect(back.y).toBeLessThan(forward.y);
    expect(back.progress).toBeLessThan(forward.progress);
  });

  test('keeps the proof phone inside the field and off the headline at phone widths', async ({
    page,
  }) => {
    await page.setContent(canvasHtml(true), { waitUntil: 'load' });
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 375, height: 667 },
      { width: 360, height: 640 },
      { width: 320, height: 568 },
    ] as const) {
      await page.setViewportSize({ ...viewport });
      const boxes = await page.evaluate(() => {
        const rect = (selector: string) => {
          const el = document.querySelector(selector);
          if (!(el instanceof HTMLElement)) {
            throw new Error(`missing ${selector}`);
          }
          const box = el.getBoundingClientRect();
          return {
            top: box.top,
            bottom: box.bottom,
            left: box.left,
            right: box.right,
            width: box.width,
            height: box.height,
          };
        };
        return {
          field: rect('.homepage-hero-canvas__field'),
          copy: rect('.homepage-hero-canvas__copy'),
          headline: rect('.homepage-hero-canvas__headline'),
          proof: rect('.homepage-hero-canvas__proof'),
          screen: rect('.homepage-hero-canvas__proof .mobile-web-screen'),
        };
      });
      const label = `${viewport.width}x${viewport.height}`;
      // The phone sits fully inside the hero field.
      expect(boxes.proof.top, `${label} phone above the field`).toBeGreaterThan(
        boxes.field.top - 0.5
      );
      expect(
        boxes.proof.bottom,
        `${label} phone below the field`
      ).toBeLessThanOrEqual(boxes.field.bottom + 0.5);
      // The phone is in the field's flow under the copy, so it can never
      // cover the headline — assert it, do not assume it.
      expect(
        boxes.proof.top,
        `${label} phone overlaps the copy`
      ).toBeGreaterThan(boxes.copy.bottom - 1);
      expect(
        boxes.headline.bottom,
        `${label} headline runs under the phone`
      ).toBeLessThanOrEqual(boxes.proof.top + 1);
      // The headline itself stays fully inside the field.
      expect(
        boxes.headline.top,
        `${label} headline clipped by the field top`
      ).toBeGreaterThan(boxes.field.top - 1);
      // The phone keeps the real screen aspect (402/874) at every width.
      expect(boxes.screen.height / boxes.screen.width).toBeCloseTo(
        874 / 402,
        2
      );
    }
  });

  test('captures dark progress frames at 1440 and 390', async ({ page }) => {
    mkdirSync(shotDir, { recursive: true });
    await page.setContent(canvasHtml(false), { waitUntil: 'load' });
    await bindProgressDriver(page);
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
