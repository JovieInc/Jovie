import { expect, test } from '@playwright/test';

/**
 * Keyboard users must always see where they are. Tab through public entry
 * surfaces and assert every focused element paints a focus-visible indicator
 * (ring box-shadow or outline). Guards the globals.css default layer.
 */
const ROUTES = ['/', '/start'];

for (const route of ROUTES) {
  test(`focus-visible ring is shown while tabbing ${route}`, async ({
    page,
  }) => {
    await page.goto(route);
    await page.waitForLoadState('domcontentloaded');
    const missing: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const result = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const ring = cs.boxShadow && cs.boxShadow !== 'none';
        const outline =
          cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
        const underline = cs.textDecorationLine.includes('underline');
        return {
          ok: Boolean(ring || outline || underline),
          label: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} ${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}`,
        };
      });
      if (result && !result.ok) missing.push(result.label);
    }
    expect(
      missing,
      `elements without a visible focus indicator on ${route}`
    ).toEqual([]);
  });
}
