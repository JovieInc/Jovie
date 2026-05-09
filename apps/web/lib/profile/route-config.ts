/**
 * Central route config for /{username}/* public profile routes.
 *
 * Single source of truth consumed by:
 * - Bottom tab bar visibility (JOV-2022)
 * - Active tab mapping
 * - Shell chrome rendering
 * - Analytics surface naming
 * - Route classification
 *
 * Do NOT scatter `if pathname.includes(...)` logic for tab bar visibility.
 * All route → behaviour decisions live here.
 *
 * Spec: docs/public-profile-surface-spec.md §1 (Route Categories)
 *       docs/public-profile-surface-spec.md §2 (Bottom Tab Bar Contract)
 */

import type {
  ProfileMode,
  ProfilePrimaryTab,
} from '@/features/profile/contracts';

// ---------------------------------------------------------------------------
// Route category
// ---------------------------------------------------------------------------

/**
 * The five canonical route categories from §1 of the spec.
 *
 * - `top-level`        §1.1 — compact profile surface, tab bar visible
 * - `secondary`        §1.2 — full-page, no tab bar
 * - `external-action`  §1.3 — redirect/side-effect only, no UI
 * - `redirect-sink`    §1.4 — server 307 redirect to ?mode= equivalent
 * - `system`           §1.5 — loading / empty / error / 404 states
 */
export type ProfileRouteCategory =
  | 'top-level'
  | 'secondary'
  | 'external-action'
  | 'redirect-sink'
  | 'system';

// ---------------------------------------------------------------------------
// Route key — stable string identifier for each route entry
// ---------------------------------------------------------------------------

export type ProfileRouteKey =
  // top-level (§1.1)
  | 'profile-root'
  | 'mode-listen'
  | 'mode-subscribe'
  | 'mode-tour'
  | 'mode-releases'
  | 'mode-about'
  | 'mode-contact'
  | 'mode-pay'
  // secondary (§1.2)
  | 'alerts'
  | 'notifications'
  | 'content-smart-link'
  | 'track-smart-link'
  | 'sounds'
  | 'promo-download'
  // external-action (§1.3)
  | 'claim'
  | 'shop'
  | 'tip'
  // redirect-sink (§1.4)
  | 'redirect-about'
  | 'redirect-contact'
  | 'redirect-listen'
  | 'redirect-pay'
  | 'redirect-releases'
  | 'redirect-subscribe'
  | 'redirect-tour'
  // system (§1.5)
  | 'not-found'
  | 'profile-error'
  | 'release-error'
  | 'catch-all';

// ---------------------------------------------------------------------------
// Bottom tab bar primary tab keys
// ---------------------------------------------------------------------------

/**
 * The four primary tabs.
 * Order is fixed per spec §2.1.
 */
export const BOTTOM_TAB_KEYS = [
  'profile',
  'listen',
  'tour',
  'subscribe',
] as const satisfies readonly ProfilePrimaryTab[];

export type BottomTabKey = (typeof BOTTOM_TAB_KEYS)[number];

// ---------------------------------------------------------------------------
// Route config entry
// ---------------------------------------------------------------------------

export interface ProfileRouteConfig {
  /**
   * Stable identifier for this route entry.
   * Used for active-tab mapping and analytics surface naming.
   */
  readonly key: ProfileRouteKey;

  /**
   * Route category per spec §1.
   * Determines tab bar visibility and shell chrome.
   */
  readonly category: ProfileRouteCategory;

  /**
   * Human-readable label (Title Case). Used in analytics and debugging.
   * Not rendered in UI — use copy contract in spec §5 for UI strings.
   */
  readonly label: string;

  /**
   * Build the canonical URL for this route.
   * @param username — the artist handle (without leading slash)
   * @param extra — optional extra path segments or query params
   */
  readonly buildPath: (username: string, extra?: string) => string;

  /**
   * Whether the bottom tab bar is visible on this route.
   * Derived from category: only `top-level` routes show the tab bar.
   *
   * JOV-2022 owns the tab bar *rendering* — this flag drives visibility,
   * tab bar rendering lives in ProfileCompactSurface.
   */
  readonly showBottomTabBar: boolean;

  /**
   * Which primary tab is active when this route is rendered.
   * `null` for non-top-level routes (tab bar not shown).
   */
  readonly activeTab: BottomTabKey | null;

  /**
   * Whether this route maps to a ?mode= query-param on the profile root.
   * `null` for routes that are not mode-based.
   */
  readonly profileMode: ProfileMode | null;

  /**
   * Analytics surface name for this route.
   * Emitted as `surface` in all profile analytics events.
   */
  readonly analyticsSurface: string;

  /**
   * Whether this route is a secondary task flow that has its own metadata.
   * Secondary routes (§1.2) need their own OG/Twitter/JSON-LD metadata.
   */
  readonly hasOwnMetadata: boolean;

  /**
   * ISR / caching strategy description.
   * Informational only — actual Next.js config lives in route files.
   */
  readonly caching:
    | 'isr-3600'
    | 'isr-300'
    | 'server-dynamic'
    | 'redirect'
    | 'static';
}

// ---------------------------------------------------------------------------
// Route config registry
// ---------------------------------------------------------------------------

export const PROFILE_ROUTE_CONFIG: Record<ProfileRouteKey, ProfileRouteConfig> =
  {
    // ── §1.1 Top-Level Profile Section ──────────────────────────────────────

    'profile-root': {
      key: 'profile-root',
      category: 'top-level',
      label: 'Profile Home',
      buildPath: username => `/${username}`,
      showBottomTabBar: true,
      activeTab: 'profile',
      profileMode: 'profile',
      analyticsSurface: 'profile_home',
      hasOwnMetadata: true,
      caching: 'server-dynamic', // JOV-2023 will move this to isr-3600
    },

    'mode-listen': {
      key: 'mode-listen',
      category: 'top-level',
      label: 'Music',
      buildPath: username => `/${username}?mode=listen`,
      showBottomTabBar: true,
      activeTab: 'listen',
      profileMode: 'listen',
      analyticsSurface: 'profile_music',
      hasOwnMetadata: false,
      caching: 'server-dynamic',
    },

    'mode-subscribe': {
      key: 'mode-subscribe',
      category: 'top-level',
      label: 'Alerts',
      buildPath: username => `/${username}?mode=subscribe`,
      showBottomTabBar: true,
      activeTab: 'subscribe',
      profileMode: 'subscribe',
      analyticsSurface: 'profile_alerts',
      hasOwnMetadata: false,
      caching: 'server-dynamic',
    },

    'mode-tour': {
      key: 'mode-tour',
      category: 'top-level',
      label: 'Events',
      buildPath: username => `/${username}?mode=tour`,
      showBottomTabBar: true,
      activeTab: 'tour',
      profileMode: 'tour',
      analyticsSurface: 'profile_events',
      hasOwnMetadata: false,
      caching: 'server-dynamic',
    },

    // Drawer-overlay modes — tab bar visible, active tab is Music
    'mode-releases': {
      key: 'mode-releases',
      category: 'top-level',
      label: 'Releases',
      buildPath: username => `/${username}?mode=releases`,
      showBottomTabBar: true,
      activeTab: 'listen',
      profileMode: 'releases',
      analyticsSurface: 'profile_releases',
      hasOwnMetadata: false,
      caching: 'server-dynamic',
    },

    // Drawer overlay modes — tab bar visible, active tab is Home
    'mode-about': {
      key: 'mode-about',
      category: 'top-level',
      label: 'About',
      buildPath: username => `/${username}?mode=about`,
      showBottomTabBar: true,
      activeTab: 'profile',
      profileMode: 'about',
      analyticsSurface: 'profile_about',
      hasOwnMetadata: false,
      caching: 'server-dynamic',
    },

    'mode-contact': {
      key: 'mode-contact',
      category: 'top-level',
      label: 'Contact',
      buildPath: username => `/${username}?mode=contact`,
      showBottomTabBar: true,
      activeTab: 'profile',
      profileMode: 'contact',
      analyticsSurface: 'profile_contact',
      hasOwnMetadata: false,
      caching: 'server-dynamic',
    },

    'mode-pay': {
      key: 'mode-pay',
      category: 'top-level',
      label: 'Pay',
      buildPath: username => `/${username}?mode=pay`,
      showBottomTabBar: true,
      activeTab: 'profile',
      profileMode: 'pay',
      analyticsSurface: 'profile_pay',
      hasOwnMetadata: false,
      caching: 'server-dynamic',
    },

    // ── §1.2 Secondary Task Flow ─────────────────────────────────────────────

    alerts: {
      key: 'alerts',
      category: 'secondary',
      label: 'Alerts Landing',
      buildPath: username => `/${username}/alerts`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: null,
      analyticsSurface: 'alerts_landing',
      hasOwnMetadata: true,
      caching: 'isr-3600',
    },

    notifications: {
      key: 'notifications',
      category: 'secondary',
      label: 'Notifications (legacy)',
      buildPath: username => `/${username}/notifications`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: null,
      analyticsSurface: 'notifications_legacy',
      hasOwnMetadata: false,
      caching: 'server-dynamic',
    },

    'content-smart-link': {
      key: 'content-smart-link',
      category: 'secondary',
      label: 'Release Smart Link',
      buildPath: (username, slug) => `/${username}/${slug ?? '[slug]'}`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: null,
      analyticsSurface: 'smart_link_release',
      hasOwnMetadata: true,
      caching: 'isr-300',
    },

    'track-smart-link': {
      key: 'track-smart-link',
      category: 'secondary',
      label: 'Track Smart Link',
      buildPath: (username, extra) =>
        `/${username}/${extra ?? '[slug]/[trackSlug]'}`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: null,
      analyticsSurface: 'smart_link_track',
      hasOwnMetadata: true,
      caching: 'isr-300',
    },

    sounds: {
      key: 'sounds',
      category: 'secondary',
      label: 'Sounds',
      buildPath: (username, slug) => `/${username}/${slug ?? '[slug]'}/sounds`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: null,
      analyticsSurface: 'smart_link_sounds',
      hasOwnMetadata: true,
      caching: 'isr-300',
    },

    'promo-download': {
      key: 'promo-download',
      category: 'secondary',
      label: 'Promo Download',
      buildPath: (username, slug) =>
        `/${username}/${slug ?? '[slug]'}/download`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: null,
      analyticsSurface: 'promo_download',
      hasOwnMetadata: false,
      caching: 'server-dynamic',
    },

    // ── §1.3 External Action ─────────────────────────────────────────────────

    claim: {
      key: 'claim',
      category: 'external-action',
      label: 'Claim',
      buildPath: username => `/${username}/claim`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: null,
      analyticsSurface: 'profile_claim',
      hasOwnMetadata: false,
      caching: 'server-dynamic',
    },

    shop: {
      key: 'shop',
      category: 'external-action',
      label: 'Shop Redirect',
      buildPath: username => `/${username}/shop`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: null,
      analyticsSurface: 'profile_shop',
      hasOwnMetadata: false,
      caching: 'isr-3600',
    },

    tip: {
      key: 'tip',
      category: 'external-action',
      label: 'Tip (legacy redirect)',
      buildPath: username => `/${username}/tip`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: null,
      analyticsSurface: 'profile_tip_redirect',
      hasOwnMetadata: false,
      caching: 'redirect',
    },

    // ── §1.4 Redirect Sink ───────────────────────────────────────────────────

    'redirect-about': {
      key: 'redirect-about',
      category: 'redirect-sink',
      label: 'About (redirect sink)',
      buildPath: username => `/${username}/about`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: 'about',
      analyticsSurface: 'redirect_about',
      hasOwnMetadata: false,
      caching: 'redirect',
    },

    'redirect-contact': {
      key: 'redirect-contact',
      category: 'redirect-sink',
      label: 'Contact (redirect sink)',
      buildPath: username => `/${username}/contact`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: 'contact',
      analyticsSurface: 'redirect_contact',
      hasOwnMetadata: false,
      caching: 'redirect',
    },

    'redirect-listen': {
      key: 'redirect-listen',
      category: 'redirect-sink',
      label: 'Listen (redirect sink)',
      buildPath: username => `/${username}/listen`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: 'listen',
      analyticsSurface: 'redirect_listen',
      hasOwnMetadata: false,
      caching: 'redirect',
    },

    'redirect-pay': {
      key: 'redirect-pay',
      category: 'redirect-sink',
      label: 'Pay (redirect sink)',
      buildPath: username => `/${username}/pay`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: 'pay',
      analyticsSurface: 'redirect_pay',
      hasOwnMetadata: false,
      caching: 'redirect',
    },

    'redirect-releases': {
      key: 'redirect-releases',
      category: 'redirect-sink',
      label: 'Releases (redirect sink)',
      buildPath: username => `/${username}/releases`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: 'releases',
      analyticsSurface: 'redirect_releases',
      hasOwnMetadata: false,
      caching: 'redirect',
    },

    'redirect-subscribe': {
      key: 'redirect-subscribe',
      category: 'redirect-sink',
      label: 'Subscribe (redirect sink)',
      buildPath: username => `/${username}/subscribe`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: 'subscribe',
      analyticsSurface: 'redirect_subscribe',
      hasOwnMetadata: false,
      caching: 'redirect',
    },

    'redirect-tour': {
      key: 'redirect-tour',
      category: 'redirect-sink',
      label: 'Tour (redirect sink)',
      buildPath: username => `/${username}/tour`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: 'tour',
      analyticsSurface: 'redirect_tour',
      hasOwnMetadata: false,
      caching: 'redirect',
    },

    // ── §1.5 System / Utility State ──────────────────────────────────────────

    'not-found': {
      key: 'not-found',
      category: 'system',
      label: '404 Not Found',
      buildPath: username => `/${username}`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: null,
      analyticsSurface: 'profile_not_found',
      hasOwnMetadata: false,
      caching: 'static',
    },

    'profile-error': {
      key: 'profile-error',
      category: 'system',
      label: 'Profile Error',
      buildPath: username => `/${username}`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: null,
      analyticsSurface: 'profile_error',
      hasOwnMetadata: false,
      caching: 'static',
    },

    'release-error': {
      key: 'release-error',
      category: 'system',
      label: 'Release Error',
      buildPath: (username, slug) => `/${username}/${slug ?? '[slug]'}`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: null,
      analyticsSurface: 'release_error',
      hasOwnMetadata: false,
      caching: 'static',
    },

    'catch-all': {
      key: 'catch-all',
      category: 'system',
      label: 'Catch-All (redirect to root)',
      buildPath: username => `/${username}`,
      showBottomTabBar: false,
      activeTab: null,
      profileMode: null,
      analyticsSurface: 'profile_catch_all',
      hasOwnMetadata: false,
      caching: 'redirect',
    },
  };

// ---------------------------------------------------------------------------
// Accessor helpers
// ---------------------------------------------------------------------------

/**
 * Look up a route config entry by key.
 * Throws at runtime if the key is not in the registry — ensures exhaustiveness.
 */
export function getProfileRouteConfig(
  key: ProfileRouteKey
): ProfileRouteConfig {
  const config = PROFILE_ROUTE_CONFIG[key];
  if (!config) {
    throw new Error(`[profile/route-config] Unknown route key: ${key}`);
  }

  return config;
}

/**
 * Given a profile mode string (from ?mode= query param), resolve the canonical
 * route config entry for that mode within the top-level category.
 *
 * Falls back to `profile-root` for unknown modes.
 */
export function getRouteConfigForMode(
  mode: string | null | undefined
): ProfileRouteConfig {
  if (!mode) return PROFILE_ROUTE_CONFIG['profile-root'];

  const modeKeyMap: Record<string, ProfileRouteKey> = {
    profile: 'profile-root',
    listen: 'mode-listen',
    subscribe: 'mode-subscribe',
    tour: 'mode-tour',
    releases: 'mode-releases',
    about: 'mode-about',
    contact: 'mode-contact',
    pay: 'mode-pay',
    tip: 'mode-pay', // tip is a legacy alias for pay
  };

  const key = modeKeyMap[mode] ?? 'profile-root';
  return PROFILE_ROUTE_CONFIG[key];
}

/**
 * Returns true if the given route category shows the bottom tab bar.
 * Only `top-level` routes show the tab bar per spec §2.2.
 */
export function categoryShowsTabBar(category: ProfileRouteCategory): boolean {
  return category === 'top-level';
}

/**
 * All top-level route entries, in the canonical order:
 * profile-root, listen, tour, subscribe, then drawer-overlay modes.
 */
export const TOP_LEVEL_ROUTE_KEYS: readonly ProfileRouteKey[] = [
  'profile-root',
  'mode-listen',
  'mode-tour',
  'mode-subscribe',
  'mode-releases',
  'mode-about',
  'mode-contact',
  'mode-pay',
] as const;

/**
 * All redirect-sink route keys — routes that only exist to redirect to a
 * ?mode= equivalent and never render their own UI.
 */
export const REDIRECT_SINK_ROUTE_KEYS: readonly ProfileRouteKey[] = [
  'redirect-about',
  'redirect-contact',
  'redirect-listen',
  'redirect-pay',
  'redirect-releases',
  'redirect-subscribe',
  'redirect-tour',
] as const;

/**
 * Resolve the active primary tab for a given mode, accounting for the
 * spec §2.4 rule: if mode is `tour` and hasTourDates is false, fall back
 * to `profile`.
 */
export function resolveActiveTab(
  mode: string | null | undefined,
  options?: { readonly hasTourDates?: boolean }
): BottomTabKey {
  const config = getRouteConfigForMode(mode);
  const activeTab = config.activeTab ?? 'profile';

  // §2.3 + §2.4: Events tab falls back to Home when no tour dates
  if (activeTab === 'tour' && !(options?.hasTourDates ?? true)) {
    return 'profile';
  }

  return activeTab;
}
