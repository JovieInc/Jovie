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
  readonly rail: DOMRect;
  readonly scrollDisplay: string;
  readonly columnGap: string;
  readonly paddingLeft: string;
  readonly docOverflow: number;
}

async function readGeometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const q = (id: string) =>
      document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const shell = q('profile-compact-shell');
    const identity = q('profile-identity-header');
    const rail = q('profile-home-rail');
    const scroll = q('profile-content-scroll');
    if (!shell || !identity || !rail || !scroll) {
      throw new Error('profile home surface did not render');
    }
    const style = getComputedStyle(scroll);
    return {
      shell: shell.getBoundingClientRect().toJSON(),
      identity: identity.getBoundingClientRect().toJSON(),
      rail: rail.getBoundingClientRect().toJSON(),
      scrollDisplay: style.display,
      columnGap: style.columnGap,
      paddingLeft: style.paddingLeft,
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
    expect(
      g.rail.top,
      'featured card sits below identity'
    ).toBeGreaterThanOrEqual(g.identity.bottom - 1);
    expect(g.docOverflow).toBeLessThanOrEqual(0);
  });

  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    test(`${viewport.width}px is identity left, featured card right`, async ({
      page,
    }) => {
      await openFixture(page, viewport.width, viewport.height);
      const g = await readGeometry(page);
      expect(g.scrollDisplay).toBe('grid');

      // Two columns: identity entirely left of the featured card.
      expect(g.identity.right).toBeLessThanOrEqual(g.rail.left);
      // Vertically balanced, not a card hanging off one column.
      const identityMid = g.identity.top + g.identity.height / 2;
      const railMid = g.rail.top + g.rail.height / 2;
      expect(Math.abs(identityMid - railMid)).toBeLessThanOrEqual(24);
      // Larger than the phone card, and inside the shell.
      expect(g.rail.width).toBeGreaterThan(430);
      expect(g.rail.left).toBeGreaterThanOrEqual(g.shell.left);
      expect(g.rail.right).toBeLessThanOrEqual(g.shell.right);
      // Shell is centered with equal gutters.
      const viewportWidth = viewport.width;
      expect(
        Math.abs(g.shell.left - (viewportWidth - g.shell.right))
      ).toBeLessThanOrEqual(2);
      // 4/8 grid: gap and inset are multiples of 8.
      expect(Number.parseFloat(g.columnGap) % 8).toBe(0);
      expect(Number.parseFloat(g.paddingLeft) % 8).toBe(0);
      expect(g.docOverflow).toBeLessThanOrEqual(0);
    });
  }
});
