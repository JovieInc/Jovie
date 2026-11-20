import { expect, type Page } from '@playwright/test';

/**
 * The wide public-profile desktop surface ships by default (canonical Pen
 * frame D9kdx); a build opts out with the build-time flag
 * NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE=0 / `false` / empty. Run
 * Playwright with the same value the server was built with (unset counts
 * as shipped);
 * `expectDesktopSurfaceBuildMatches` fails loudly on a mismatch.
 */
export const PROFILE_DESKTOP_SURFACE_SHIPPED = !(
  process.env.NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE === '0' ||
  process.env.NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE === 'false' ||
  process.env.NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE === ''
);

export const PROFILE_DESKTOP_BREAKPOINT = 1180;

export function expectedPublicProfileLayout(
  width: number
): 'compact' | 'desktop' {
  return PROFILE_DESKTOP_SURFACE_SHIPPED && width >= PROFILE_DESKTOP_BREAKPOINT
    ? 'desktop'
    : 'compact';
}

export async function expectDesktopSurfaceBuildMatches(page: Page) {
  await expect(
    page.locator(
      '[data-testid="public-profile-layout-shell"].profile-viewport--desktop-surface'
    ),
    'server build and NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE in the test runner disagree'
  ).toHaveCount(PROFILE_DESKTOP_SURFACE_SHIPPED ? 1 : 0);
}

/**
 * Geometry of the compact shell relative to the viewport, used to prove the
 * flag-off presentation is a centered column (phone column below 1024px, the
 * two-column desktop composition at or above it).
 */
export async function readCompactColumnGeometry(page: Page) {
  return page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(
      '[data-testid="profile-compact-shell"]'
    );
    if (!shell) return null;
    const rect = shell.getBoundingClientRect();
    // >= 1024px the flag-off profile is the two-column desktop composition
    // (--profile-desktop-max-width); below it, the phone column.
    const rootStyle = getComputedStyle(document.documentElement);
    const desktopComposition = window.innerWidth >= 1024;
    const maxWidth = Number.parseFloat(
      rootStyle.getPropertyValue(
        desktopComposition
          ? '--profile-desktop-max-width'
          : '--profile-shell-max-width'
      )
    );
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      // clientWidth excludes a classic vertical scrollbar, so centering is
      // measured against the visible layout viewport.
      viewportWidth: document.documentElement.clientWidth,
      maxWidth,
    };
  });
}

export async function expectCenteredPhoneColumn(page: Page) {
  const geometry = await readCompactColumnGeometry(page);
  expect(geometry, 'compact shell must render').not.toBeNull();
  if (!geometry) return;
  const receipt = JSON.stringify(geometry);
  expect(Number.isFinite(geometry.maxWidth), receipt).toBe(true);
  expect(geometry.width, receipt).toBeLessThanOrEqual(geometry.maxWidth + 1);
  expect(geometry.width, receipt).toBeGreaterThan(geometry.maxWidth * 0.9);
  expect(
    Math.abs(geometry.left - (geometry.viewportWidth - geometry.right)),
    `compact column must be horizontally centered: ${receipt}`
  ).toBeLessThanOrEqual(2);
}
