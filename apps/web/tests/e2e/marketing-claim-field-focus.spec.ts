import { expect, test } from './setup';

/**
 * Homepage hero claim field, focused state (2026-10-28 regression: a square
 * browser/utility ring around the inner input inside the rounded pill).
 *
 * The CompositeField container owns the focus ring. The inner input paints
 * none, the ring follows the pill radius, and it clears 3:1 non-text contrast
 * (WCAG 2.2 1.4.11) against the page behind it. Screenshots are attached for
 * the vision critic (`design-canonical` rubric, deliberate-red case:
 * "composite field shows a square inner focus ring").
 *
 * @layout-guard
 */

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

/** Tailwind composes zero-width ring layers, so "not none" proves nothing. */
const RING_LAYER = /(?:-?\d+(?:\.\d+)?px\s+){3}[1-9]\d*(?:\.\d+)?px/;

function channels(color: string): [number, number, number] {
  const m = color.match(/rgba?\(([^)]+)\)/);
  const [r, g, b] = (m?.[1] ?? '0,0,0')
    .split(/[ ,/]+/)
    .slice(0, 3)
    .map(Number);
  return [r ?? 0, g ?? 0, b ?? 0];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: [number, number, number], b: [number, number, number]) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

async function innerInputPaintsOwnRing(
  input: import('@playwright/test').Locator
): Promise<boolean> {
  return input.evaluate(el => {
    const own = getComputedStyle(el);
    const outline = own.outlineStyle !== 'none' && own.outlineWidth !== '0px';
    const shadow = /(?:-?\d+(?:\.\d+)?px\s+){3}[1-9]\d*(?:\.\d+)?px/.test(
      own.boxShadow
    );
    return outline || shadow;
  });
}

test.describe('homepage hero claim field focus', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const viewport of VIEWPORTS) {
    test(`pill owns the focus ring at ${viewport.name}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const input = page.locator('#homepage-claim-handle');
      await input.focus();
      await expect(input).toBeFocused();

      // The ring transitions in (duration-subtle); wait for it to settle.
      await expect
        .poll(() =>
          input.evaluate(el => {
            const field = el.closest('[data-component="composite-field"]');
            return field ? getComputedStyle(field).boxShadow : 'none';
          })
        )
        .toMatch(RING_LAYER);

      const styles = await input.evaluate(el => {
        const field = el.closest('[data-component="composite-field"]');
        if (!field) return null;
        const own = getComputedStyle(el);
        const box = getComputedStyle(field);
        const rect = field.getBoundingClientRect();
        return {
          inputOutlineStyle: own.outlineStyle,
          inputOutlineWidth: own.outlineWidth,
          inputBoxShadow: own.boxShadow,
          fieldBoxShadow: box.boxShadow,
          fieldRadius: Number.parseFloat(box.borderTopLeftRadius),
          fieldHeight: rect.height,
          pageBackground: getComputedStyle(document.body).backgroundColor,
        };
      });

      expect(styles, 'claim input must sit inside a CompositeField').not.toBe(
        null
      );
      if (!styles) return;

      // Inner input: no square outline or ring of its own.
      expect(await innerInputPaintsOwnRing(input)).toBe(false);

      // Container: a visible ring that follows the pill radius.
      expect(styles.fieldBoxShadow).toMatch(RING_LAYER);
      expect(styles.fieldRadius).toBeGreaterThanOrEqual(styles.fieldHeight / 2);

      // The ring clears 3:1 against what sits next to it (the offset gap).
      const layers = [
        ...styles.fieldBoxShadow.matchAll(
          /(rgba?\([^)]+\))\s+(?:-?\d+(?:\.\d+)?px\s+){3}([1-9]\d*(?:\.\d+)?)px/g
        ),
      ];
      expect(layers.length).toBeGreaterThanOrEqual(1);
      const ring = layers.at(-1)?.[1] ?? '';
      const gap = layers.length > 1 ? (layers.at(-2)?.[1] ?? '') : '';
      expect(
        contrast(channels(ring), channels(gap || styles.pageBackground))
      ).toBeGreaterThanOrEqual(3);

      const claim = page.getByTestId('homepage-hero-claim');
      const shot = await claim.screenshot({ animations: 'disabled' });
      await testInfo.attach(`claim-field-focused-${viewport.name}`, {
        body: shot,
        contentType: 'image/png',
      });
    });
  }

  // Deliberate red: the exact 2026-10-28 regression (a square ring painted by
  // the inner input) must be detected, otherwise the check above proves
  // nothing. The screenshot is the negative exemplar for the vision critic
  // (`design-canonical`: a focus ring must trace the container's radius).
  test('deliberate red: a square inner-input ring is detected', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.addStyleTag({
      content:
        '#homepage-claim-handle:focus, #homepage-claim-handle:focus-visible { outline: 2px solid rgb(17, 175, 255) !important; box-shadow: 0 0 0 2px rgb(17, 175, 255) !important; }',
    });
    const input = page.locator('#homepage-claim-handle');
    await input.focus();
    await expect.poll(() => innerInputPaintsOwnRing(input)).toBe(true);
    await testInfo.attach('claim-field-focused-DELIBERATE-RED-square-ring', {
      body: await page
        .getByTestId('homepage-hero-claim')
        .screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });
  });
});
