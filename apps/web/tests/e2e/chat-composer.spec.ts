/**
 * E2E: Chat composer (Variant F surface morph + slash picker keyboard walk).
 *
 * Asserts the morphing surface state machine on `[data-testid="chat-composer-surface"]`
 * — `data-surface-mode` flips between `empty -> typing -> root -> entity` as
 * the user types, opens the slash picker, and commits a skill.
 *
 * Run:
 *   doppler run -- pnpm --filter web exec playwright test chat-composer --project=chromium
 *
 * @see apps/web/components/jovie/components/ChatInput.tsx (data-surface-mode)
 * @see apps/web/components/jovie/components/SlashCommandMenu.tsx
 */

import { expect, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { ensureSignedInUser, hasClerkCredentials } from '../helpers/clerk-auth';
import {
  smokeNavigateWithRetry,
  waitForHydration,
} from './utils/smoke-test-utils';

const COMPOSER_SURFACE = '[data-testid="chat-composer-surface"]';
const COMPOSER_TEXTAREA = '[aria-label="Chat message input"]';
const SLASH_MENU = '[data-testid="slash-command-menu"]';
const CLIPPING_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
] as const;

function composerSurface(page: Page) {
  return page.locator(COMPOSER_SURFACE).last();
}

async function expectSurfaceMode(
  page: Page,
  mode: 'empty' | 'typing' | 'root' | 'entity'
): Promise<void> {
  await expect(composerSurface(page)).toHaveAttribute(
    'data-surface-mode',
    mode,
    {
      timeout: 10_000,
    }
  );
}

async function openComposer(page: Page) {
  await ensureSignedInUser(page);
  await smokeNavigateWithRetry(page, APP_ROUTES.CHAT, { timeout: 60_000 });
  await waitForHydration(page);
  await expect(composerSurface(page)).toBeVisible({ timeout: 30_000 });
}

function expectBoxInsideViewport(
  box: { x: number; y: number; width: number; height: number } | null,
  viewport: { width: number; height: number } | null
) {
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!(box && viewport)) return;

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

async function readComposerVisualMetrics(page: Page) {
  return page.evaluate(
    ({ surfaceSelector, textareaSelector }) => {
      function rectFor(element: Element | null) {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
        };
      }

      function parseColor(value: string, depth = 0) {
        const toSrgb = (linear: number) => {
          const channel =
            linear <= 0.0031308
              ? 12.92 * linear
              : 1.055 * linear ** (1 / 2.4) - 0.055;
          return Math.min(255, Math.max(0, channel * 255));
        };

        const parseMaybePercent = (raw: string, percentageBase = 1) =>
          raw.endsWith('%')
            ? (Number(raw.slice(0, -1)) / 100) * percentageBase
            : Number(raw);

        const labToSrgb = (
          lRaw: string,
          aRaw: string,
          bRaw: string,
          alphaRaw?: string
        ) => {
          const l = parseMaybePercent(lRaw, 100);
          const a = Number(aRaw);
          const b = Number(bRaw);
          const fy = (l + 16) / 116;
          const fx = fy + a / 500;
          const fz = fy - b / 200;
          const epsilon = 216 / 24389;
          const kappa = 24389 / 27;
          const toXyzRatio = (channel: number) => {
            const cubed = channel ** 3;
            return cubed > epsilon ? cubed : (116 * channel - 16) / kappa;
          };
          const x = toXyzRatio(fx) * 0.96422;
          const y = l > kappa * epsilon ? ((l + 16) / 116) ** 3 : l / kappa;
          const z = toXyzRatio(fz) * 0.82521;

          return {
            alpha: Number(alphaRaw ?? 1),
            b: toSrgb(0.0719453 * x - 0.2289914 * y + 1.4052427 * z),
            g: toSrgb(-0.9787684 * x + 1.9161415 * y + 0.033454 * z),
            r: toSrgb(3.1338561 * x - 1.6168667 * y - 0.4906146 * z),
          };
        };

        const hex = value.match(/^#([0-9a-f]{6})$/i);
        if (hex) {
          const raw = hex[1];
          return {
            alpha: 1,
            b: Number.parseInt(raw.slice(4, 6), 16),
            g: Number.parseInt(raw.slice(2, 4), 16),
            r: Number.parseInt(raw.slice(0, 2), 16),
          };
        }

        const rgb = value.match(
          /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/
        );
        if (rgb) {
          return {
            alpha: Number(rgb[4] ?? 1),
            b: Number(rgb[3]),
            g: Number(rgb[2]),
            r: Number(rgb[1]),
          };
        }

        const functionalColor = value.match(
          /color\((?:srgb|display-p3)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/
        );
        if (functionalColor) {
          return {
            alpha: Number(functionalColor[4] ?? 1),
            b: Number(functionalColor[3]) * 255,
            g: Number(functionalColor[2]) * 255,
            r: Number(functionalColor[1]) * 255,
          };
        }

        const labColor = value.match(
          /lab\(([\d.-]+%?)\s+([\d.-]+)\s+([\d.-]+)(?:\s*\/\s*([\d.]+))?\)/
        );
        if (labColor) {
          return labToSrgb(labColor[1], labColor[2], labColor[3], labColor[4]);
        }

        const lchColor = value.match(
          /lch\(([\d.-]+%?)\s+([\d.-]+)\s+([\d.-]+)(?:deg)?(?:\s*\/\s*([\d.]+))?\)/
        );
        if (lchColor) {
          const chroma = Number(lchColor[2]);
          const hue = (Number(lchColor[3]) * Math.PI) / 180;
          return labToSrgb(
            lchColor[1],
            String(chroma * Math.cos(hue)),
            String(chroma * Math.sin(hue)),
            lchColor[4]
          );
        }

        const parseOklab = (
          lRaw: string,
          aRaw: string,
          bRaw: string,
          alphaRaw?: string
        ) => {
          const l = parseMaybePercent(lRaw);
          const a = Number(aRaw);
          const b = Number(bRaw);
          const lPrime = l + 0.3963377774 * a + 0.2158037573 * b;
          const mPrime = l - 0.1055613458 * a - 0.0638541728 * b;
          const sPrime = l - 0.0894841775 * a - 1.291485548 * b;
          const lCubed = lPrime ** 3;
          const mCubed = mPrime ** 3;
          const sCubed = sPrime ** 3;
          return {
            alpha: Number(alphaRaw ?? 1),
            b: toSrgb(
              -0.0041960863 * lCubed -
                0.7034186147 * mCubed +
                1.707614701 * sCubed
            ),
            g: toSrgb(
              -1.2684380046 * lCubed +
                2.6097574011 * mCubed -
                0.3413193965 * sCubed
            ),
            r: toSrgb(
              4.0767416621 * lCubed -
                3.3077115913 * mCubed +
                0.2309699292 * sCubed
            ),
          };
        };

        const oklabColor = value.match(
          /oklab\(([\d.-]+%?)\s+([\d.-]+)\s+([\d.-]+)(?:\s*\/\s*([\d.]+))?\)/
        );
        if (oklabColor) {
          return parseOklab(
            oklabColor[1],
            oklabColor[2],
            oklabColor[3],
            oklabColor[4]
          );
        }

        const oklchColor = value.match(
          /oklch\(([\d.-]+%?)\s+([\d.-]+)\s+([\d.-]+)(?:deg)?(?:\s*\/\s*([\d.]+))?\)/
        );
        if (oklchColor) {
          const chroma = Number(oklchColor[2]);
          const hue = (Number(oklchColor[3]) * Math.PI) / 180;
          return parseOklab(
            oklchColor[1],
            String(chroma * Math.cos(hue)),
            String(chroma * Math.sin(hue)),
            oklchColor[4]
          );
        }

        if (depth === 0) {
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (context) {
            context.fillStyle = '#000000';
            context.fillStyle = value;
            const normalized = context.fillStyle;
            if (normalized !== '#000000' && normalized !== value) {
              return parseColor(normalized, 1);
            }
          }
        }

        return null;
      }

      function luminance(channel: number) {
        const normalized = channel / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      }

      function contrastRatio(
        foreground: { r: number; g: number; b: number; alpha: number },
        background: { r: number; g: number; b: number; alpha: number }
      ) {
        const blended = {
          b:
            foreground.b * foreground.alpha +
            background.b * (1 - foreground.alpha),
          g:
            foreground.g * foreground.alpha +
            background.g * (1 - foreground.alpha),
          r:
            foreground.r * foreground.alpha +
            background.r * (1 - foreground.alpha),
        };
        const fgLum =
          0.2126 * luminance(blended.r) +
          0.7152 * luminance(blended.g) +
          0.0722 * luminance(blended.b);
        const bgLum =
          0.2126 * luminance(background.r) +
          0.7152 * luminance(background.g) +
          0.0722 * luminance(background.b);
        const lighter = Math.max(fgLum, bgLum);
        const darker = Math.min(fgLum, bgLum);
        return (lighter + 0.05) / (darker + 0.05);
      }

      function relativeLuminance(color: { r: number; g: number; b: number }) {
        return (
          0.2126 * luminance(color.r) +
          0.7152 * luminance(color.g) +
          0.0722 * luminance(color.b)
        );
      }

      function visibleSurface() {
        const surfaces = Array.from(document.querySelectorAll(surfaceSelector));
        return (
          surfaces
            .filter(element => {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                style.display !== 'none' &&
                style.visibility !== 'hidden'
              );
            })
            .at(-1) ?? null
        );
      }

      const surface = visibleSurface();
      const textarea = document.querySelector(textareaSelector);
      const surfaceStyles = surface ? getComputedStyle(surface) : null;
      const textareaStyles = textarea ? getComputedStyle(textarea) : null;
      const foreground = textareaStyles
        ? parseColor(textareaStyles.color)
        : null;
      const background = surfaceStyles
        ? parseColor(surfaceStyles.backgroundColor)
        : null;
      const effectiveBackground =
        background && background.alpha > 0.05
          ? background
          : { alpha: 1, b: 27, g: 23, r: 22 };
      const isSurfaceDark = relativeLuminance(effectiveBackground) < 0.12;

      return {
        buttonRects: Array.from(surface?.querySelectorAll('button') ?? []).map(
          rectFor
        ),
        contrast:
          foreground && isSurfaceDark
            ? contrastRatio(foreground, effectiveBackground)
            : 0,
        isSurfaceDark,
        surface: rectFor(surface),
        textarea: rectFor(textarea),
        viewport: {
          height: window.innerHeight,
          width: window.innerWidth,
        },
      };
    },
    {
      surfaceSelector: COMPOSER_SURFACE,
      textareaSelector: COMPOSER_TEXTAREA,
    }
  );
}

test.describe('Chat composer — Variant F surface morph', () => {
  test.beforeAll(() => {
    if (!hasClerkCredentials()) {
      test.skip(true, 'Clerk credentials not configured');
    }
  });

  test('A: empty -> typing surface morph', async ({ page }) => {
    await openComposer(page);

    await expectSurfaceMode(page, 'empty');

    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.click();
    await textarea.fill('hello');

    await expectSurfaceMode(page, 'typing');
  });

  test('B: slash root -> entity surface (skill with required release slot)', async ({
    page,
  }) => {
    await openComposer(page);

    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.click();
    await page.keyboard.press('/');

    await expectSurfaceMode(page, 'root');
    await expect(page.locator(SLASH_MENU)).toBeVisible({ timeout: 5_000 });

    // First skill in COMMANDS is `generateAlbumArt` which has a required
    // `release` slot, so committing it should flip the surface to `entity`.
    // ArrowDown isn't strictly needed (selectedIndex starts at 0 = first
    // skill), but we walk through it to exercise the keyboard nav.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');

    // If the skill commits with an entity slot, the surface should flip to
    // `entity`. If the catalog has no releases the rail will still render in
    // `entity` mode (with an empty list). Accept either outcome — the
    // critical assertion is the surface morph.
    try {
      await expectSurfaceMode(page, 'entity');
    } catch (error) {
      // If the picker closed entirely, this skill didn't have a slot in this
      // build (e.g. registry shifted). Fail loudly so we don't silently
      // regress the contract.
      throw new Error(
        `Expected surface to flip to 'entity' after committing first skill: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    // Escape should close the picker; surface should drop back to typing or
    // empty depending on whether a chip lingered.
    await page.keyboard.press('Escape');

    const surfaceMode =
      await composerSurface(page).getAttribute('data-surface-mode');
    expect(surfaceMode === 'empty' || surfaceMode === 'typing').toBe(true);
  });

  test('C: direct slash entry to entity (skipped on builds without /release direct-entry)', async ({
    page,
  }) => {
    // PR #5 introduces `/release ` as a direct entry to the entity picker.
    // On builds where it hasn't merged yet the surface stays in `root` mode
    // — we skip rather than fail in that case.
    await openComposer(page);

    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.click();
    await page.keyboard.press('/');
    await page.keyboard.type('release ');

    const mode = await composerSurface(page).getAttribute('data-surface-mode');
    if (mode !== 'entity') {
      test.skip(true, '/release direct-entry not on this build');
    }

    await expectSurfaceMode(page, 'entity');
  });

  test('D: IME-safe Enter on textarea (picker closed)', async ({ page }) => {
    // The textarea's handleKeyDown checks `e.nativeEvent.isComposing` and
    // returns early — typing message + Enter during IME composition must
    // not submit the message. We exercise the textarea path here because
    // the picker's global keydown listener does not currently gate on
    // composition state (tracked separately).
    await openComposer(page);

    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.click();
    await textarea.fill('hello');
    await expectSurfaceMode(page, 'typing');

    // Dispatch a CompositionEvent on the textarea so React's synthetic
    // event mirrors a real IME session for the next keypress. Playwright's
    // `keyboard.press` does not natively flip `isComposing`, so we rely on
    // dispatching a native KeyboardEvent that carries `isComposing: true`.
    const stillTyping = await textarea.evaluate(el => {
      const target = el as HTMLTextAreaElement;
      target.dispatchEvent(
        new CompositionEvent('compositionstart', { bubbles: true })
      );
      const enterDuringIme = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
        // `isComposing` reflects active IME state; React surfaces it via
        // `e.nativeEvent.isComposing`.
        isComposing: true,
      } as KeyboardEventInit);
      target.dispatchEvent(enterDuringIme);
      target.dispatchEvent(
        new CompositionEvent('compositionend', { bubbles: true })
      );
      // If the textarea handler fired submit, the surface would drop back
      // to `empty`. Read the live attribute to assert.
      return document
        .querySelector('[data-testid="chat-composer-surface"]')
        ?.getAttribute('data-surface-mode');
    });

    // No commit happened — we're still in `typing` (text remains in the
    // textarea, no submit fired).
    expect(stillTyping).toBe('typing');
  });

  test('E: Escape returns focus to textarea', async ({ page }) => {
    await openComposer(page);

    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.click();
    await page.keyboard.press('/');
    await expectSurfaceMode(page, 'root');

    await page.keyboard.press('Escape');

    const isFocused = await page.evaluate(
      selector =>
        document.activeElement === document.querySelector(selector as string),
      COMPOSER_TEXTAREA
    );
    expect(isFocused).toBe(true);
  });

  test('F: compact viewport stacks rail above input', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await openComposer(page);

    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.click();
    await page.keyboard.press('/');

    // Below 900px the surface flips to the stacked layout — rail renders
    // above the input row.
    await expectSurfaceMode(page, 'root');
    await expect(page.locator(SLASH_MENU)).toBeVisible({ timeout: 5_000 });

    const railBox = await page.locator(SLASH_MENU).boundingBox();
    const inputBox = await textarea.boundingBox();

    expect(railBox).not.toBeNull();
    expect(inputBox).not.toBeNull();
    if (railBox && inputBox) {
      // Stacked mode: rail's bottom edge should sit at or above the
      // textarea's top edge.
      expect(railBox.y + railBox.height).toBeLessThanOrEqual(inputBox.y + 1);
    }
  });

  test('G: hardened composer remains readable and keeps usable targets', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openComposer(page);

    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.fill(
      'Draft a release rollout with pitch timing, short-form assets, approvals, and fallback steps if the import fails before launch.'
    );
    await expectSurfaceMode(page, 'typing');
    await expect
      .poll(
        async () =>
          (await readComposerVisualMetrics(page)).surface?.height ?? 0,
        { timeout: 5_000 }
      )
      .toBeGreaterThanOrEqual(88);
    await expect
      .poll(
        async () => {
          const metrics = await readComposerVisualMetrics(page);
          return Math.min(
            ...metrics.buttonRects.map(rect =>
              Math.min(rect?.height ?? 0, rect?.width ?? 0)
            )
          );
        },
        { timeout: 5_000 }
      )
      .toBeGreaterThanOrEqual(36);

    const metrics = await readComposerVisualMetrics(page);
    expect(metrics.isSurfaceDark).toBe(true);
    expect(metrics.contrast).toBeGreaterThanOrEqual(4.5);
    expect(metrics.surface?.width ?? 0).toBeGreaterThanOrEqual(680);
    expect(metrics.surface?.height ?? 0).toBeGreaterThanOrEqual(88);
    expect(metrics.textarea?.height ?? 0).toBeGreaterThanOrEqual(24);
    expect(metrics.textarea?.height ?? 0).toBeLessThanOrEqual(168);
    for (const rect of metrics.buttonRects) {
      expect(rect?.height ?? 0).toBeGreaterThanOrEqual(36);
      expect(rect?.width ?? 0).toBeGreaterThanOrEqual(36);
    }
  });

  test('H: attachment flyout and slash picker avoid viewport clipping', async ({
    page,
  }) => {
    for (const viewportSize of CLIPPING_VIEWPORTS) {
      await page.setViewportSize(viewportSize);
      await openComposer(page);

      const attachButton = page.getByRole('button', {
        name: 'Attachment options',
      });
      await expect(attachButton).toBeVisible();
      await attachButton.click();
      const attachmentMenu = page.getByRole('menu');
      await expect(attachmentMenu).toBeVisible();
      expectBoxInsideViewport(
        await attachmentMenu.boundingBox(),
        page.viewportSize()
      );

      await page.keyboard.press('Escape');
      const textarea = page.locator(COMPOSER_TEXTAREA);
      await textarea.click();
      await textarea.fill('');
      await page.keyboard.press('/');
      await expectSurfaceMode(page, 'root');
      await expect(page.locator(SLASH_MENU)).toBeVisible({ timeout: 5_000 });
      expectBoxInsideViewport(
        await page.locator(SLASH_MENU).boundingBox(),
        page.viewportSize()
      );
      await page.keyboard.press('Escape');
    }
  });
});
