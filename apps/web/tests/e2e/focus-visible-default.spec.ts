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
        const paintsIndicator = (node: Element): boolean => {
          const cs = getComputedStyle(node);
          const ring = cs.boxShadow && cs.boxShadow !== 'none';
          const outline =
            cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
          const underline = cs.textDecorationLine.includes('underline');
          return Boolean(ring || outline || underline);
        };
        // CompositeField (packages/ui/atoms/composite-field.tsx) owns the
        // focus treatment for fields built from a control plus adjacent
        // parts: the container paints the ring
        // (.composite-field:has(:is(input…):focus-visible)) and the inner
        // control paints nothing of its own by design (#23562 — a square
        // default ring must never show inside the rounded field). A focused
        // control inside one is visibly indicated by its field frame, so the
        // indicator check accepts the canonical composite host's ring. Every
        // other focused element still has to paint its own indicator.
        const compositeHost = el.closest("[data-component='composite-field']");
        const ok =
          paintsIndicator(el) ||
          (compositeHost !== null && paintsIndicator(compositeHost));
        return {
          ok,
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
