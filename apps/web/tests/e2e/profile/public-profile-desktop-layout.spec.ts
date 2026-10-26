import { expect, type Page, test } from '@playwright/test';
import { PROFILE_DESKTOP_SURFACE_SHIPPED } from '../utils/profile-desktop-surface';
import { installPublicRouteMocks } from '../utils/public-surface-helpers';

/**
 * Desktop artist profile (Tim, 2026-10-25): at >= 1024px the Home tab is a calm
 * two-column composition (identity left, the one featured card right). The
 * layout is CSS only, so the phone profile must stay a single stacked column.
 * Guards: mobile never grows columns; desktop never regresses to a phone card
 * floating in empty space; spacing stays on the 4/8 grid.
 */
const FIXTURE = '/renders/profile-admission?layout=public&state=unclaimed';

interface Geometry {
  readonly shell: DOMRect;
  readonly identity: DOMRect;
  readonly portrait: DOMRect;
  readonly art: DOMRect;
  readonly primary: DOMRect | null;
  readonly listenPillVisible: boolean;
  readonly tabs: DOMRect;
  readonly tabLabelVisible: boolean;
  readonly scrollDisplay: string;
  readonly columnGap: string;
  readonly shellBorder: string;
  readonly shellRadius: string;
  readonly docOverflow: number;
}

async function readGeometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const q = (id: string) =>
      document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const shell = q('profile-compact-shell');
    const identity = q('profile-identity-header');
    const portrait = q('profile-identity-portrait');
    const art = q('profile-pac-featured-art');
    const scroll = q('profile-content-scroll');
    const tabs = q('profile-bottom-nav');
    const listenPill = q('profile-identity-listen');
    const primary = art
      .closest('section')
      ?.querySelector<HTMLElement>('a.group > span');
    if (!shell || !identity || !portrait || !art || !scroll || !tabs) {
      throw new Error('profile home surface did not render');
    }
    const style = getComputedStyle(scroll);
    const shellStyle = getComputedStyle(shell);
    const label = tabs.querySelector<HTMLElement>(
      '.profile-liquid-glass-nav__label'
    );
    const labelBox = label?.getBoundingClientRect();
    return {
      shell: shell.getBoundingClientRect().toJSON(),
      identity: identity.getBoundingClientRect().toJSON(),
      portrait: portrait.getBoundingClientRect().toJSON(),
      art: art.getBoundingClientRect().toJSON(),
      primary: primary?.getBoundingClientRect().toJSON() ?? null,
      listenPillVisible: Boolean(listenPill && listenPill.offsetWidth > 0),
      tabs: tabs.getBoundingClientRect().toJSON(),
      tabLabelVisible: Boolean(labelBox && labelBox.width > 8),
      scrollDisplay: style.display,
      columnGap: style.columnGap,
      shellBorder: shellStyle.borderTopWidth,
      shellRadius: shellStyle.borderTopLeftRadius,
      docOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    };
  });
}

async function openFixture(page: Page, width: number, height: number) {
  await installPublicRouteMocks(page);
  await page.setViewportSize({ width, height });
  await page.goto(FIXTURE, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('profile-home-rail')).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(r => requestAnimationFrame(() => r()));
    await new Promise<void>(r => requestAnimationFrame(() => r()));
  });
}

test.describe('desktop artist profile layout', () => {
  test.skip(
    PROFILE_DESKTOP_SURFACE_SHIPPED,
    'The flagged wide surface replaces the compact composition'
  );

  test('390px stays a single stacked phone column (unchanged)', async ({
    page,
  }) => {
    await openFixture(page, 390, 844);
    const g = await readGeometry(page);
    expect(g.scrollDisplay).toBe('flex');
    expect(g.shell.width).toBeLessThanOrEqual(390);
    expect(g.art.width, 'phone art stays the small thumb').toBeLessThan(200);
    expect(g.tabLabelVisible, 'phone dock stays icon only').toBe(false);
    expect(g.docOverflow).toBeLessThanOrEqual(0);
  });

  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    test(`${viewport.width}px is a designed desktop page`, async ({ page }) => {
      await openFixture(page, viewport.width, viewport.height);
      const g = await readGeometry(page);
      expect(g.scrollDisplay).toBe('grid');

      // The page is the canvas: no phone chrome.
      expect(g.shellBorder).toBe('0px');
      expect(g.shellRadius).toBe('0px');

      // Identity left, featured thing right, tops aligned.
      expect(g.identity.right).toBeLessThanOrEqual(g.art.left);
      expect(Math.abs(g.portrait.top - g.art.top)).toBeLessThanOrEqual(8);
      // Hero cover is a 400px square, identity portrait is 160px.
      expect(g.art.width).toBeCloseTo(400, 0);
      expect(g.art.height).toBeCloseTo(400, 0);
      expect(g.portrait.width).toBeCloseTo(160, 0);
      // One primary action: the card's, at the 44px minimum. No duplicate
      // Listen pill in the identity column.
      expect(g.listenPillVisible).toBe(false);
      expect(g.primary?.height ?? 0).toBeGreaterThanOrEqual(44);
      // Tabs are a visible text row, above the content, not a bottom dock.
      expect(g.tabLabelVisible).toBe(true);
      expect(g.tabs.bottom).toBeLessThanOrEqual(g.art.top);
      // 4/8 grid: gap is a multiple of 8.
      expect(Number.parseFloat(g.columnGap) % 8).toBe(0);
      // Composition is centered horizontally.
      const mid = (g.identity.left + g.art.right) / 2;
      expect(Math.abs(mid - viewport.width / 2)).toBeLessThanOrEqual(8);
      expect(g.docOverflow).toBeLessThanOrEqual(0);
    });
  }
});
