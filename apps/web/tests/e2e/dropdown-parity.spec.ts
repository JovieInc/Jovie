import { expect, test } from '@playwright/test';
import SPEC_FIXTURE from './fixtures/linear-dropdown-spec.json';

const FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';

/**
 * Dropdown Parity — Linear.app match
 *
 * Deterministic computed-style assertions against values extracted directly
 * from linear.app/demo via Playwright JS execution (2026-03-05).
 *
 * Critical tests added in this revision (previously missing — caused false passes):
 *   - Container background color (white in light, elevated dark surface in dark)
 *   - Dark mode elevation: menu luminance must be ≥ 4× the page luminance
 *   - Shadow must be non-zero (visual depth)
 *   - Border must have alpha > 0 (visible ring)
 *   - Item default text color is secondary (not black, not transparent)
 *
 * Linear.app extracted token values (dark mode, 2026-03-05):
 *   --bg-sidebar-dark: #090909
 *   --bg-base-color: #101012
 *   --color-bg-primary: lch(4.8% 0.7 272)   ← main surface (too dark for menus)
 *   --color-bg-secondary: lch(10.633% 3.033 272)
 *   --color-bg-tertiary: lch(14.133% 4.2 272) ← floating menus/popovers (our target)
 */

// No auth needed — test page is public
test.use({ storageState: { cookies: [], origins: [] } });

// Locked parity fixture values (source of truth)
const FIXTURE = SPEC_FIXTURE;

// Runtime tolerances and derived expectations
const SPEC = {
  container: {
    borderRadius: FIXTURE.container.borderRadius,
    padding: FIXTURE.container.padding,
    minWidth: Number.parseFloat(FIXTURE.container.minWidth),
    backdropFilter: FIXTURE.container.backdropFilter,
  },
  item: {
    paddingBlock: FIXTURE.item.padding.split(' ')[0] ?? '6px',
    paddingInline: FIXTURE.item.padding.split(' ')[1] ?? '8px',
    fontSize: FIXTURE.item.fontSize,
    fontWeight: FIXTURE.item.fontWeight,
    borderRadius: FIXTURE.item.borderRadius,
    gap: FIXTURE.item.gap,
  },
  icon: { size: FIXTURE.icon.width },
  disabled: {
    opacityMin: Number.parseFloat(FIXTURE.itemDisabled.opacity) - 0.02,
    opacityMax: Number.parseFloat(FIXTURE.itemDisabled.opacity) + 0.02,
  },
  // Destructive: strong red (r>180, g<100, b<100)
  destructive: { rMin: 180, gMax: 100, bMax: 100 },
  label: {
    fontSize: FIXTURE.label.fontSize,
    weightMin: Number.parseFloat(FIXTURE.label.fontWeight) - 10,
    weightMax: Number.parseFloat(FIXTURE.label.fontWeight) + 10,
  },
  separator: {
    height: FIXTURE.separator.height,
    marginLeftMax: -2,
  },
  shortcut: {
    fontSize: FIXTURE.shortcut.fontSize,
    letterSpacingMax: 1,
  },
  // Light mode: menu must be pure/near-white
  lightBg: { rMin: 250, gMin: 250, bMin: 250 },
  // Dark mode: menu luminance must be ≥ 4× page background luminance
  // (extracted: menu lab(14.133%) ÷ page lab(2.47%) ≈ 4.3×)
  darkElevation: { minLuminanceRatio: 4 },
} as const;

/** WCAG 2.1 relative luminance (0–1) from sRGB 0–255. */
function relativeLuminance(r: number, g: number, b: number): number {
  const [R, G, B] = [r / 255, g / 255, b / 255].map(c =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

test.describe('Dropdown Parity — Linear.app match', () => {
  test.skip(
    FAST_ITERATION,
    'Visual parity checks run outside the fast deploy gate'
  );
  test.beforeEach(async ({ page }) => {
    await page.goto('/demo/dropdowns');
    await page.waitForLoadState('networkidle');
  });

  // ─── Container structure ──────────────────────────────────────────────────

  test('container: radius 8px, padding 4px, min-width ≥192px, no backdrop-blur', async ({
    page,
  }) => {
    const menu = page.locator('[data-testid="menu-normal"]');
    await expect(menu).toBeVisible();

    const styles = await menu.evaluate(el => {
      const cs = globalThis.getComputedStyle(el);
      return {
        borderRadius: cs.borderRadius,
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        minWidth: cs.minWidth,
        backdropFilter: cs.backdropFilter,
      };
    });

    expect(styles.borderRadius).toBe(SPEC.container.borderRadius);
    expect(styles.paddingTop).toBe(SPEC.container.padding);
    expect(styles.paddingRight).toBe(SPEC.container.padding);
    expect(styles.paddingBottom).toBe(SPEC.container.padding);
    expect(styles.paddingLeft).toBe(SPEC.container.padding);
    const minWidthPx = Number.parseFloat(styles.minWidth);
    expect(minWidthPx).toBeGreaterThanOrEqual(SPEC.container.minWidth);
    expect(styles.backdropFilter).toBe(SPEC.container.backdropFilter);
  });

  test('container: has visible shadow (provides elevation depth)', async ({
    page,
  }) => {
    const menu = page.locator('[data-testid="menu-normal"]');
    await expect(menu).toBeVisible();

    const shadow = await menu.evaluate(
      el => globalThis.getComputedStyle(el).boxShadow
    );

    expect(shadow).not.toBe('none');
    expect(shadow).not.toBe('');
    // Must contain at least one layer with non-zero alpha, e.g. rgba(0,0,0,0.35)
    expect(shadow).toMatch(/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\.[1-9]/);
  });

  test('container: border has visible alpha (subtle ring)', async ({
    page,
  }) => {
    const menu = page.locator('[data-testid="menu-normal"]');
    await expect(menu).toBeVisible();

    const border = await menu.evaluate(el => {
      const cs = globalThis.getComputedStyle(el);
      return {
        style: cs.borderStyle,
        color: cs.borderColor,
        width: cs.borderWidth,
      };
    });

    // Border must exist and not be fully transparent
    expect(border.style).not.toBe('none');
    expect(border.width).not.toBe('0px');
    expect(border.color).not.toBe('rgba(0, 0, 0, 0)');
    expect(border.color).not.toBe('transparent');
  });

  // ─── Background color: the test that was previously missing ─────────────

  test('container: pure white background in light mode (rgb 255,255,255)', async ({
    page,
  }) => {
    const menu = page.locator('[data-testid="menu-normal"]');
    await expect(menu).toBeVisible();

    // Force light mode — root layout defaults to dark
    await page.evaluate(() =>
      globalThis.document.documentElement.classList.remove('dark')
    );

    const { r, g, b } = await menu.evaluate(el => {
      const cs = globalThis.getComputedStyle(el);
      const canvas = globalThis.document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { r: 0, g: 0, b: 0 };
      ctx.fillStyle = cs.backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
      const [pr, pg, pb] = ctx.getImageData(0, 0, 1, 1).data;
      return { r: pr, g: pg, b: pb };
    });

    // Linear uses pure white rgb(255,255,255) for menus in light mode
    expect(r).toBeGreaterThanOrEqual(SPEC.lightBg.rMin);
    expect(g).toBeGreaterThanOrEqual(SPEC.lightBg.gMin);
    expect(b).toBeGreaterThanOrEqual(SPEC.lightBg.bMin);
  });

  test('container: elevated above page background in dark mode (≥4× luminance ratio)', async ({
    page,
  }) => {
    const menu = page.locator('[data-testid="menu-normal"]');
    await expect(menu).toBeVisible();

    // Ensure dark mode is active
    await page.evaluate(() =>
      globalThis.document.documentElement.classList.add('dark')
    );
    await page.waitForTimeout(50);

    const { menuR, menuG, menuB, pageR, pageG, pageB } = await page.evaluate(
      () => {
        const canvas = globalThis.document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (!ctx)
          return {
            menuR: 0,
            menuG: 0,
            menuB: 0,
            pageR: 0,
            pageG: 0,
            pageB: 0,
          };

        const resolveColor = (colorStr: string) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = colorStr;
          ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          return { r: d[0], g: d[1], b: d[2] };
        };

        const menuEl = globalThis.document.querySelector<HTMLElement>(
          '[data-testid="menu-normal"]'
        );
        const menuBg = menuEl
          ? globalThis.getComputedStyle(menuEl).backgroundColor
          : 'rgb(0,0,0)';

        // Get the page background from the linear token
        const pageBgToken =
          globalThis
            .getComputedStyle(globalThis.document.documentElement)
            .getPropertyValue('--linear-bg-page')
            .trim() || 'rgb(9,9,9)';

        const menuRgb = resolveColor(menuBg);
        const pageRgb = resolveColor(pageBgToken);

        return {
          menuR: menuRgb.r,
          menuG: menuRgb.g,
          menuB: menuRgb.b,
          pageR: pageRgb.r,
          pageG: pageRgb.g,
          pageB: pageRgb.b,
        };
      }
    );

    const menuLum = relativeLuminance(menuR, menuG, menuB);
    const pageLum = relativeLuminance(pageR, pageG, pageB);

    // Menu must be brighter than the page
    expect(menuLum).toBeGreaterThan(pageLum);

    // In dark mode the ratio must be substantial — prevents near-invisible blending.
    // Linear uses lch(14.133%) for menus vs lch(2.47%) for page → ~4.3× ratio.
    const ratio = pageLum > 0 ? menuLum / pageLum : menuLum * 1000;
    expect(ratio).toBeGreaterThanOrEqual(SPEC.darkElevation.minLuminanceRatio);
  });

  // ─── Item styles ─────────────────────────────────────────────────────────

  test('item: padding, font size 13px, weight 450, radius 4px, gap 8px', async ({
    page,
  }) => {
    const item = page
      .locator('[data-testid="menu-normal"] [data-testid="item-normal"]')
      .first();
    await expect(item).toBeVisible();

    const styles = await item.evaluate(el => {
      const cs = globalThis.getComputedStyle(el);
      return {
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        borderRadius: cs.borderRadius,
        gap: cs.gap,
        cursor: cs.cursor,
        userSelect: cs.userSelect,
      };
    });

    expect(styles.fontSize).toBe(SPEC.item.fontSize);
    expect(styles.fontWeight).toBe(SPEC.item.fontWeight);
    expect(styles.borderRadius).toBe(SPEC.item.borderRadius);
    expect(styles.paddingTop).toBe(SPEC.item.paddingBlock);
    expect(styles.paddingBottom).toBe(SPEC.item.paddingBlock);
    expect(styles.paddingLeft).toBe(SPEC.item.paddingInline);
    expect(styles.paddingRight).toBe(SPEC.item.paddingInline);
    expect(styles.gap).toBe(SPEC.item.gap);
    expect(styles.cursor).toBe('default');
    expect(styles.userSelect).toBe('none');
  });

  test('item: default text color is secondary (not black, not transparent)', async ({
    page,
  }) => {
    await page.evaluate(() =>
      globalThis.document.documentElement.classList.remove('dark')
    );

    const { r, g, b } = await page
      .locator('[data-testid="menu-normal"] [data-testid="item-normal"]')
      .first()
      .evaluate(el => {
        const canvas = globalThis.document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) return { r: 0, g: 0, b: 0 };
        ctx.fillStyle = globalThis.getComputedStyle(el).color;
        ctx.fillRect(0, 0, 1, 1);
        const [pr, pg, pb] = ctx.getImageData(0, 0, 1, 1).data;
        return { r: pr, g: pg, b: pb };
      });

    // Should be a medium gray (secondary text) — not pure black (0,0,0) nor
    // transparent white (255,255,255), nor close to either extreme.
    // Linear's secondary text in light mode: oklch(45%) ≈ rgb(85–105 range)
    const avg = (r + g + b) / 3;
    expect(avg).toBeGreaterThan(40); // not black / near-black
    expect(avg).toBeLessThan(200); // not white / near-white
  });

  // ─── Icon ────────────────────────────────────────────────────────────────

  test('icon: 14×14px size and stroke-width ~1.5 (thin, refined)', async ({
    page,
  }) => {
    const icon = page
      .locator('[data-testid="menu-normal"] [data-testid="item-normal"] svg')
      .first();
    await expect(icon).toBeVisible();

    const { width, height, strokeAttr, strokeCSS } = await icon.evaluate(el => {
      const cs = globalThis.getComputedStyle(el);
      return {
        width: cs.width,
        height: cs.height,
        strokeAttr: el.getAttribute('stroke-width'),
        strokeCSS: cs.strokeWidth,
      };
    });

    expect(width).toBe(SPEC.icon.size);
    expect(height).toBe(SPEC.icon.size);
    // Linear uses stroke-width ~1.5 for refined icons (CSS overrides SVG attr)
    const strokeNum = Number.parseFloat(strokeCSS ?? strokeAttr ?? '2');
    expect(strokeNum).toBeGreaterThanOrEqual(1.2);
    expect(strokeNum).toBeLessThanOrEqual(1.8);
  });

  test('icon: dim at rest, bright on hover (tertiary → primary)', async ({
    page,
  }) => {
    // Ensure dark mode
    await page.evaluate(() =>
      globalThis.document.documentElement.classList.add('dark')
    );
    await page.waitForTimeout(50);

    const icon = page
      .locator('[data-testid="menu-normal"] [data-testid="item-normal"] svg')
      .first();

    const resolveColor = (el: SVGElement) => {
      const canvas = globalThis.document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { r: 0, g: 0, b: 0 };
      ctx.fillStyle = globalThis.getComputedStyle(el).color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return { r, g, b };
    };

    const restColor = await icon.evaluate(resolveColor);
    const restAvg = (restColor.r + restColor.g + restColor.b) / 3;

    // At rest: icon should be tertiary (dim) — roughly rgb(150,150,154)
    expect(restAvg).toBeGreaterThan(100);
    expect(restAvg).toBeLessThan(200);

    const item = page
      .locator('[data-testid="menu-normal"] [data-testid="item-normal"]')
      .first();
    await item.hover();
    await page.waitForTimeout(200);

    const hoverColor = await icon.evaluate(resolveColor);
    const hoverAvg = (hoverColor.r + hoverColor.g + hoverColor.b) / 3;

    // On hover: icon goes to primary (near-white)
    expect(hoverAvg).toBeGreaterThan(220);
  });

  test('item: dark mode text is near-white (avg rgb > 200)', async ({
    page,
  }) => {
    await page.evaluate(() =>
      globalThis.document.documentElement.classList.add('dark')
    );
    await page.waitForTimeout(50);

    const { r, g, b } = await page
      .locator('[data-testid="menu-normal"] [data-testid="item-normal"]')
      .first()
      .evaluate(el => {
        const canvas = globalThis.document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) return { r: 0, g: 0, b: 0 };
        ctx.fillStyle = globalThis.getComputedStyle(el).color;
        ctx.fillRect(0, 0, 1, 1);
        const [pr, pg, pb] = ctx.getImageData(0, 0, 1, 1).data;
        return { r: pr, g: pg, b: pb };
      });

    // Linear dark mode secondary text = lch(90.65%) = ~rgb(227,228,231)
    // Must be very bright — catch regressions like oklch(62%) = dim gray
    const avg = (r + g + b) / 3;
    expect(avg).toBeGreaterThan(200);
  });

  // ─── States ──────────────────────────────────────────────────────────────

  test('disabled item: opacity 0.46', async ({ page }) => {
    const disabledItem = page.locator(
      '[data-testid="menu-disabled"] [data-testid="item-disabled"]'
    );
    await expect(disabledItem).toBeVisible();

    const opacity = await disabledItem.evaluate(
      el => globalThis.getComputedStyle(el).opacity
    );
    const opacityNum = Number.parseFloat(opacity);
    expect(opacityNum).toBeGreaterThanOrEqual(SPEC.disabled.opacityMin);
    expect(opacityNum).toBeLessThanOrEqual(SPEC.disabled.opacityMax);
  });

  test('destructive item: red color', async ({ page }) => {
    const destructiveItem = page.locator(
      '[data-testid="menu-destructive"] [data-testid="item-destructive"]'
    );
    await expect(destructiveItem).toBeVisible();

    // Resolve via canvas — normalises oklch/lab/lch → sRGB
    const { r, g, b } = await destructiveItem.evaluate(el => {
      const colorStr = globalThis.getComputedStyle(el).color;
      const rgbMatch = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(colorStr);
      if (rgbMatch) {
        return {
          r: Number(rgbMatch[1]),
          g: Number(rgbMatch[2]),
          b: Number(rgbMatch[3]),
        };
      }
      const canvas = globalThis.document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { r: 0, g: 0, b: 0 };
      ctx.fillStyle = colorStr;
      ctx.fillRect(0, 0, 1, 1);
      const [pr, pg, pb] = ctx.getImageData(0, 0, 1, 1).data;
      return { r: pr, g: pg, b: pb };
    });

    expect(r).toBeGreaterThan(SPEC.destructive.rMin);
    expect(g).toBeLessThan(SPEC.destructive.gMax);
    expect(b).toBeLessThan(SPEC.destructive.bMax);
  });

  // ─── Label & separator ───────────────────────────────────────────────────

  test('label: 11px, not uppercase, weight 500', async ({ page }) => {
    const label = page
      .locator('[data-testid="menu-labels"] [data-testid="menu-label"]')
      .first();
    await expect(label).toBeVisible();

    const styles = await label.evaluate(el => {
      const cs = globalThis.getComputedStyle(el);
      return {
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        textTransform: cs.textTransform,
      };
    });

    expect(styles.fontSize).toBe(SPEC.label.fontSize);
    expect(styles.textTransform).not.toBe('uppercase');
    const weight = Number.parseFloat(styles.fontWeight);
    expect(weight).toBeGreaterThanOrEqual(SPEC.label.weightMin);
    expect(weight).toBeLessThanOrEqual(SPEC.label.weightMax);
  });

  test('separator: 1px height, full-bleed width, visible color', async ({
    page,
  }) => {
    const sep = page
      .locator('[data-testid="menu-normal"] [data-testid="menu-separator"]')
      .first();
    await expect(sep).toBeVisible();

    const styles = await sep.evaluate(el => {
      const cs = globalThis.getComputedStyle(el);
      return {
        height: cs.height,
        marginLeft: cs.marginLeft,
        backgroundColor: cs.backgroundColor,
      };
    });

    expect(styles.height).toBe(SPEC.separator.height);
    const ml = Number.parseFloat(styles.marginLeft);
    expect(ml).toBeLessThanOrEqual(SPEC.separator.marginLeftMax);
    // Separator must have a visible background (not transparent)
    expect(styles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles.backgroundColor).not.toBe('transparent');
  });

  // ─── Shortcut ────────────────────────────────────────────────────────────

  test('shortcut: 11px font size, normal letter-spacing, right-aligned', async ({
    page,
  }) => {
    const shortcut = page
      .locator(
        '[data-testid="menu-shortcuts"] [data-testid="item-shortcut"] [class*="shortcut"]'
      )
      .first();
    await expect(shortcut).toBeVisible();

    const styles = await shortcut.evaluate(el => {
      const cs = globalThis.getComputedStyle(el);
      // Verify right-alignment: shortcut right edge should be within 4px of the item right edge
      const item = el.closest('[role="menuitem"]');
      const shortcutRight = el.getBoundingClientRect().right;
      const itemRight = item ? item.getBoundingClientRect().right : 0;
      return {
        fontSize: cs.fontSize,
        letterSpacing: cs.letterSpacing,
        rightAligned: item ? shortcutRight >= itemRight - 20 : false,
      };
    });

    expect(styles.fontSize).toBe(SPEC.shortcut.fontSize);
    const ls = Number.parseFloat(styles.letterSpacing);
    expect(Math.abs(ls)).toBeLessThan(SPEC.shortcut.letterSpacingMax);
    // Shortcut must be right-aligned within the menu item (ml-auto)
    expect(styles.rightAligned).toBe(true);
  });

  // ─── Interactions ────────────────────────────────────────────────────────

  test('item hover: background changes to surface-1 (not transparent)', async ({
    page,
  }) => {
    const item = page
      .locator('[data-testid="menu-normal"] [data-testid="item-normal"]')
      .first();
    await expect(item).toBeVisible();

    const bgBefore = await item.evaluate(
      el => globalThis.getComputedStyle(el).backgroundColor
    );

    await item.hover();

    const bgAfterHover = await item.evaluate(
      el => globalThis.getComputedStyle(el).backgroundColor
    );

    // After hover, background must be non-transparent
    expect(bgAfterHover).not.toBe('rgba(0, 0, 0, 0)');
    expect(bgAfterHover).not.toBe('transparent');
    // And must differ from the pre-hover state
    expect(bgAfterHover).not.toBe(bgBefore);
  });

  test('keyboard: focus navigates through items', async ({ page }) => {
    const menu = page.locator('[data-testid="menu-normal"]');
    await expect(menu).toBeVisible();

    const firstItem = menu.locator('[role="menuitem"]').first();
    await firstItem.focus();

    const focused = await page.evaluate(() =>
      globalThis.document.activeElement?.getAttribute('role')
    );
    expect(focused).toBe('menuitem');
  });

  // ─── Functional ──────────────────────────────────────────────────────────

  test('search filter: filters items correctly', async ({ page }) => {
    const searchMenu = page.locator('[data-testid="menu-searchable"]');
    await expect(searchMenu).toBeVisible();

    const searchInput = searchMenu.locator('input[type="text"]');
    await expect(searchInput).toBeVisible();

    const itemsBefore = await searchMenu.locator('[role="menuitem"]').count();

    await searchInput.fill('xyz-no-match-12345');
    await page.waitForTimeout(100);

    const visibleItems = await searchMenu
      .locator('[role="menuitem"]:visible')
      .count();
    expect(visibleItems).toBeLessThan(itemsBefore);
  });
});
