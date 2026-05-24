/**
 * Profile route matrix + responsive viewport coordinates for JOV-2028.
 *
 * Existing coverage:
 * - Mobile viewport stability lives in `profile-mobile-viewport-stability.spec.ts`.
 * - Horizontal-overflow checks across mobile widths live in `mobile-overflow.spec.ts`.
 * - WCAG axe scans across profile routes live in `axe-audit.spec.ts`.
 *
 * Gaps this module closes (per JOV-2028 acceptance criteria):
 * - Pixel/Android (412), tablet (768), desktop (1280) overflow coverage.
 * - Bottom tab bar active-state per route.
 * - Metadata regression assertions.
 * - Copy regression assertions.
 *
 * Keep this list short — these are the routes the test matrix iterates.
 * The canonical route inventory lives in `public-surface-manifest.ts`; we
 * project a profile-only slice here so the specs stay terse.
 */

import type { ProfilePrimaryTab } from '@/components/features/profile/contracts';

export interface ProfileMatrixRoute {
  readonly id: string;
  readonly path: string;
  /**
   * Expected active primary tab when the route resolves. `null` when the route
   * renders a drawer overlay (contact, pay) rather than a primary tab panel,
   * or when no primary tab is highlighted (e.g., home).
   */
  readonly expectedActiveTab: ProfilePrimaryTab | null;
  /**
   * Selectors that confirm the route hydrated. We wait until any one of them
   * is visible before running assertions.
   */
  readonly readySelectors: readonly string[];
  /**
   * True when the bottom tab bar should be rendered on this route. Secondary
   * task flows (notifications walkthrough) hide it.
   */
  readonly showsBottomTabBar: boolean;
}

const MUSIC_HANDLE =
  process.env.PUBLIC_SURFACE_MUSIC_HANDLE?.trim() || 'dualipa';
const TIP_HANDLE =
  process.env.PUBLIC_SURFACE_TIP_HANDLE?.trim() || 'testartist';

export const PROFILE_MATRIX_ROUTES: readonly ProfileMatrixRoute[] = [
  {
    id: 'home',
    path: `/${MUSIC_HANDLE}`,
    expectedActiveTab: 'profile',
    readySelectors: ['[data-testid="profile-header"]'],
    showsBottomTabBar: true,
  },
  {
    id: 'listen',
    path: `/${MUSIC_HANDLE}?mode=listen`,
    expectedActiveTab: 'listen',
    readySelectors: [
      '[data-testid="profile-primary-tab-listen"]',
      '[data-testid="profile-primary-tab-releases"]',
    ],
    showsBottomTabBar: true,
  },
  {
    id: 'tour',
    path: `/${MUSIC_HANDLE}?mode=tour`,
    expectedActiveTab: 'tour',
    readySelectors: ['[data-testid="profile-primary-tab-tour"]'],
    showsBottomTabBar: true,
  },
  {
    id: 'subscribe',
    path: `/${MUSIC_HANDLE}?mode=subscribe`,
    expectedActiveTab: 'subscribe',
    readySelectors: ['[data-testid="profile-primary-tab-subscribe"]'],
    showsBottomTabBar: true,
  },
  {
    id: 'about',
    path: `/${MUSIC_HANDLE}?mode=about`,
    expectedActiveTab: null,
    readySelectors: ['[data-testid="profile-primary-tab-about"]'],
    showsBottomTabBar: true,
  },
  {
    id: 'contact',
    path: `/${MUSIC_HANDLE}?mode=contact`,
    expectedActiveTab: null,
    readySelectors: ['[data-testid="profile-mode-drawer-contact"]'],
    showsBottomTabBar: true,
  },
  {
    id: 'pay',
    path: `/${TIP_HANDLE}?mode=pay`,
    expectedActiveTab: null,
    readySelectors: ['[data-testid="profile-mode-drawer-pay"]'],
    showsBottomTabBar: true,
  },
  {
    id: 'notifications-legacy',
    path: `/${TIP_HANDLE}/notifications`,
    expectedActiveTab: 'subscribe',
    readySelectors: ['[data-testid="profile-primary-tab-subscribe"]'],
    showsBottomTabBar: true,
  },
] as const;

export interface ProfileViewportBreakpoint {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly isMobile: boolean;
}

/**
 * The exact viewport set called out in JOV-2028 — iPhone SE (375), iPhone
 * 13/14 (390), Pixel/Android (412), iPhone Pro Max (430), tablet (768), and
 * desktop (1280). Mobile (<=430) already has dedicated specs; this matrix
 * adds the wider breakpoints that aren't covered today.
 */
export const PROFILE_RESPONSIVE_VIEWPORTS: readonly ProfileViewportBreakpoint[] =
  [
    {
      id: 'iphone-se',
      label: 'iPhone SE (375)',
      width: 375,
      height: 667,
      isMobile: true,
    },
    {
      id: 'iphone-13-14',
      label: 'iPhone 13/14 (390)',
      width: 390,
      height: 844,
      isMobile: true,
    },
    {
      id: 'pixel-android',
      label: 'Pixel/Android (412)',
      width: 412,
      height: 915,
      isMobile: true,
    },
    {
      id: 'iphone-pro-max',
      label: 'iPhone Pro Max (430)',
      width: 430,
      height: 932,
      isMobile: true,
    },
    {
      id: 'tablet',
      label: 'Tablet (768)',
      width: 768,
      height: 1024,
      isMobile: false,
    },
    {
      id: 'desktop',
      label: 'Desktop (1280)',
      width: 1280,
      height: 800,
      isMobile: false,
    },
  ] as const;

/**
 * The smaller set used by metadata + copy regression — runs once per route
 * at desktop only, since these assertions read DOM/head content that doesn't
 * vary with viewport.
 */
export const PROFILE_METADATA_VIEWPORT: ProfileViewportBreakpoint = {
  id: 'desktop',
  label: 'Desktop (1280)',
  width: 1280,
  height: 800,
  isMobile: false,
};
