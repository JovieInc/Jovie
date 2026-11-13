import { expect, test } from '@playwright/test';
import {
  captureStill,
  waitForSettledProfile,
  waitForSettledProfileLayout,
} from './profile-admission-layout';
import { expectedPublicProfileLayout } from './profile-desktop-surface';
import { auditPublicProfileLayout } from './public-profile-layout-invariant';
import { installPublicRouteMocks } from './public-surface-helpers';

// jov.ie/tim at 1440px: the Get-updates/Payments rail painted over the
// Selected-work/Events column. The default admission fixture ships fan
// capture off (no rail) and short titles, so these drive the rail on with
// release titles wider than any column: the two conditions the bug needed.
const FIXTURE_ROUTE =
  '/renders/profile-admission?layout=public&state=claimed&rail=on&titles=long';
const COLUMN_TEST_IDS = [
  'profile-desktop-cover',
  'profile-desktop-secondary-grid',
  'profile-desktop-side-rail',
] as const;

export function registerProfileOverviewColumnTests() {
  for (const width of [1024, 1280, 1440, 1680, 1920]) {
    test(`${width}px home overview columns never overlap or overflow`, async ({
      page,
    }, testInfo) => {
      await installPublicRouteMocks(page);
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(FIXTURE_ROUTE, {
        waitUntil: 'domcontentloaded',
      });
      expect(response?.status()).toBe(200);
      // Below the 1180px desktop breakpoint the compact shell owns the page;
      // there the audit still pins horizontal overflow.
      const layout = expectedPublicProfileLayout(width);
      await waitForSettledProfileLayout(page, layout);
      await waitForSettledProfile(page);

      if (layout === 'desktop') {
        await expect(
          page.getByTestId('profile-desktop-home-overview')
        ).toHaveAttribute('data-side-rail-enabled', 'true');
        await expect(
          page.getByTestId('profile-desktop-alerts-card')
        ).toBeVisible();
        const [cover, center, rail] = await page.evaluate(
          testIds =>
            testIds.map(testId => {
              const rect = document
                .querySelector(`[data-testid="${testId}"]`)
                ?.getBoundingClientRect();
              return rect ? { left: rect.left, right: rect.right } : null;
            }),
          [...COLUMN_TEST_IDS]
        );
        expect(cover, 'cover column must render').not.toBeNull();
        expect(center, 'center column must render').not.toBeNull();
        expect(rail, 'side rail must render').not.toBeNull();
        // Three side-by-side columns, left to right, none sharing pixels.
        expect(cover!.right).toBeLessThanOrEqual(center!.left + 1);
        expect(center!.right).toBeLessThanOrEqual(rail!.left + 1);
        expect(rail!.right).toBeLessThanOrEqual(width + 1);
      }

      // Card-level proof: no card leaves its column, no two cards in
      // different columns intersect, the center/rail gutter is the grid gap,
      // and the document does not scroll sideways.
      const audit = await auditPublicProfileLayout(page);
      expect(audit.violations, JSON.stringify(audit, null, 2)).toEqual([]);
      const overflow = await page.evaluate(
        () =>
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth
          ) - window.innerWidth
      );
      expect(overflow, 'page must not scroll sideways').toBeLessThanOrEqual(1);
      await captureStill(page, testInfo, `home-overview-columns-${width}.png`);
    });
  }

  test('deliberate red detects overlapping home overview columns', async ({
    page,
  }) => {
    await installPublicRouteMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(FIXTURE_ROUTE);
    const layout = expectedPublicProfileLayout(1440);
    expect(
      layout,
      'The sabotage only proves anything on the desktop shell'
    ).toBe('desktop');
    await waitForSettledProfileLayout(page, layout);
    expect((await auditPublicProfileLayout(page)).violations).toEqual([]);
    // Recreate the shipped bug: an intrinsically sized track lets the nowrap
    // titles widen the center cards past their column, under the rail.
    await page
      .getByTestId('profile-desktop-secondary-grid')
      .evaluate(column => {
        column.style.gridTemplateColumns = 'max-content';
      });
    const codes = (await auditPublicProfileLayout(page)).violations.map(
      violation => violation.code
    );
    expect(codes).toContain('desktop_card_outside_column');
    expect(codes).toContain('desktop_column_overlap');
  });
}
