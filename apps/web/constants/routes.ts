/**
 * Centralized route constants for the Jovie application.
 *
 * Single Domain Architecture:
 * - All routes are served from jov.ie
 * - Dashboard routes are at /app/* (e.g., /app/profile, /app/settings)
 * - Marketing and profile pages are at root (e.g., /, /username)
 *
 * For external links (emails, Stripe callbacks), use getAppUrl() from constants/domains.ts
 */

// App routes - dashboard paths within /app/*
export const APP_ROUTES = {
  // Dashboard
  DASHBOARD: '/app',
  /** Legacy dashboard landing path. Kept as a constant so the legacy redirect in `next.config.js` has a referenceable source. Do NOT use for navigation. */
  LEGACY_DASHBOARD: '/app/dashboard',
  /** Legacy earnings path. Keep for old bookmarks; use EARNINGS for canonical entry. */
  DASHBOARD_EARNINGS: '/app/dashboard/earnings',
  DASHBOARD_LINKS: '/app/dashboard/links',
  DASHBOARD_PROFILE: '/app/dashboard/profile',
  /** Legacy audience path. Keep as a redirect source only. */
  DASHBOARD_AUDIENCE: '/app/dashboard/audience',
  /** Legacy library path. Keep as a redirect source only. */
  LEGACY_DASHBOARD_LIBRARY: '/app/dashboard/library',
  DASHBOARD_LIBRARY: '/app/library',
  CHATS: '/app/chats',
  /** Legacy chat list path. Keep for old bookmarks; use CHATS for navigation. */
  THREADS: '/app/threads',
  /** Legacy release workspace route. Keep for old bookmarks and nested task aliases; use RELEASES for navigation. */
  DASHBOARD_RELEASES: '/app/dashboard/releases',
  /** Legacy tasks path. Keep for old bookmarks; use TASKS for navigation. */
  DASHBOARD_TASKS: '/app/dashboard/tasks',
  DASHBOARD_RELEASE_TASKS: '/app/dashboard/releases/[releaseId]/tasks',
  DASHBOARD_TIPPING: '/app/dashboard/tipping',
  DASHBOARD_CONTACTS: '/app/dashboard/contacts',
  DASHBOARD_TOUR_DATES: '/app/dashboard/tour-dates',
  DASHBOARD_RELEASE_PLAN: '/app/dashboard/release-plan',
  /** @deprecated Profile is now a drawer on the chat route. Use CHAT instead. */
  PROFILE: '/app/chat',
  CONTACTS: '/app/contacts',
  RELEASES: '/app/releases',
  TOUR_DATES: '/app/tour-dates',
  CALENDAR: '/app/calendar',
  AUDIENCE: '/app/audience',
  EARNINGS: '/app/earnings',
  LIBRARY: '/app/library',
  /** Legacy Tracks path. Keep as a redirect source only — Tracks folded into Library (JOV-4846). */
  LEGACY_TRACKS: '/app/tracks',
  TASKS: '/app/tasks',
  CHAT: '/app/chat',
  CHAT_PROFILE_PANEL: '/app/chat?panel=profile',
  INSIGHTS: '/app/insights',
  /** YouTube packaging optimizer — revival queue + experiment dashboard (GH-10921) */
  YOUTUBE_REVIVAL: '/app/youtube',
  JOVIE_WORK: '/app/jovie-work',
  LYRICS: '/app/lyrics',
  PROFILES: '/app/profiles',
  /** Legacy profile-presence route. Use PROFILES for navigation. */
  PRESENCE: '/app/presence',

  // Settings
  SETTINGS: '/app/settings',
  SETTINGS_ACCOUNT: '/app/settings/account',
  SETTINGS_ARTIST_PROFILE: '/app/settings/artist-profile',
  SETTINGS_APPEARANCE: '/app/settings/appearance',
  SETTINGS_BILLING: '/app/settings/billing',
  SETTINGS_USAGE: '/app/settings/usage',
  SETTINGS_PAYMENTS: '/app/settings/payments',
  SETTINGS_DATA_PRIVACY: '/app/settings/data-privacy',
  SETTINGS_CONTACTS: '/app/settings/contacts',
  SETTINGS_TOURING: '/app/settings/touring',
  SETTINGS_CONNECTORS: '/app/settings/connectors',
  SETTINGS_AUDIENCE: '/app/settings/audience',
  SETTINGS_ANALYTICS: '/app/settings/analytics',
  SETTINGS_ADMIN: '/app/settings/admin',
  SETTINGS_RETARGETING_ADS: '/app/settings/retargeting-ads',
  SETTINGS_REFERRAL: '/app/settings/referral',
  /** @deprecated Use SETTINGS_DATA_PRIVACY instead */
  SETTINGS_DELETE_ACCOUNT: '/app/settings/delete-account',

  // OV / internal operations
  OV: '/app/ov',
  /** Legacy admin root. Redirect-only; use OV or an ADMIN_* constant. */
  LEGACY_ADMIN: '/app/admin',
  ADMIN: '/app/ov',
  ADMIN_CHAT: '/app/ov/chat',
  ADMIN_OPS: '/app/ov/ops',
  ADMIN_PEOPLE: '/app/ov/people',
  ADMIN_GROWTH: '/app/ov/growth',
  ADMIN_WAITLIST: '/app/ov/waitlist',
  ADMIN_WAITLIST_SETTINGS: '/app/ov/waitlist/settings',
  ADMIN_FEEDBACK: '/app/ov/feedback',
  ADMIN_INTERVIEWS: '/app/ov/interviews',
  ADMIN_CREATORS: '/app/ov/creators',
  ADMIN_CREATORS_BULK_REFRESH: '/app/ov/creators/bulk-refresh',
  ADMIN_CREATORS_DELETE: '/app/ov/creators/delete',
  ADMIN_CREATORS_TOGGLE_FEATURED: '/app/ov/creators/toggle-featured',
  ADMIN_CREATORS_TOGGLE_MARKETING: '/app/ov/creators/toggle-marketing',
  ADMIN_CREATORS_TOGGLE_VERIFY: '/app/ov/creators/toggle-verify',
  ADMIN_USERS: '/app/ov/users',
  ADMIN_ACTIVITY: '/app/ov/activity',
  ADMIN_CAMPAIGNS: '/app/ov/campaigns',
  ADMIN_GROWTH_YC_METRICS: '/app/ov/growth/yc-metrics',
  ADMIN_INVESTORS: '/app/ov/investors',
  ADMIN_INVESTORS_LINKS: '/app/ov/investors/links',
  ADMIN_INVESTORS_SETTINGS: '/app/ov/investors/settings',
  ADMIN_LEADS: '/app/ov/leads',
  ADMIN_OUTREACH: '/app/ov/outreach',
  ADMIN_OUTREACH_EMAIL: '/app/ov/outreach/email',
  ADMIN_OUTREACH_DM: '/app/ov/outreach/dm',
  ADMIN_OUTREACH_REVIEW: '/app/ov/outreach/review',
  ADMIN_INGEST: '/app/ov/ingest',
  ADMIN_SCREENSHOTS: '/app/ov/screenshots',
  ADMIN_SHARE_STUDIO: '/app/ov/share-studio',
  ADMIN_RELEASES: '/app/ov/releases',
  ADMIN_USERS_BAN: '/app/ov/users/ban',
  ADMIN_USERS_UNBAN: '/app/ov/users/unban',
  ADMIN_ALGORITHM_HEALTH: '/app/ov/algorithm-health',
  ADMIN_PLAYLISTS: '/app/ov/playlists',
  ADMIN_PLATFORM_CONNECTIONS: '/app/ov/platform-connections',
  ADMIN_AGENT_RUN: '/app/ov/agent-runs',
  ADMIN_AGENT_RUN_DETAIL: '/app/ov/agent-runs/[id]',
  ADMIN_COSTS: '/app/ov/costs',
  /** VC/ops revenue-lift dashboard (IRPAA North Star + KPI tree). */
  ADMIN_REVENUE_LIFT: '/app/ov/revenue-lift',
  ADMIN_SYSTEM: '/app/ov/system',
  ADMIN_FEATURES: '/app/ov/features',
  /** Legacy feature-flags route. Redirect-only; use ADMIN_FEATURES. */
  LEGACY_FEATURE_FLAGS: '/app/feature-flags',

  // System
  UNAVAILABLE: '/unavailable',
  USER_CREATION_ERROR: '/error/user-creation-failed',
  DESIGN_STUDIO: '/exp/page-builder',
  /** Admin Ops HUD — shipper status, KPIs, and live metrics (admin-gated). */
  HUD: '/hud',
  /** Token-only TV/wallboard view of the Ops HUD. */
  HUD_TV: '/hud-tv',
  HUD_WIKI: '/hud/wiki' as const,

  // Marketing
  HOME: '/',
  ABOUT: '/about',
  AI: '/ai',
  ALTERNATIVES: '/alternatives',
  ARTIST_NOTIFICATIONS: '/artist-notifications',
  ARTIST_PROFILES: '/artist-profiles',
  ARTIST_PROFILE_LEGACY: '/artist-profile',
  ARTISTS: '/artists',
  BLOG: '/blog',
  BLOG_THE_CONTACT_PROBLEM: '/blog/the-contact-problem',
  BRAND: '/brand',
  BLOG_THE_MYSPACE_PROBLEM: '/blog/the-myspace-problem',
  COMPARE: '/compare',
  DEMO: '/demo',
  DEMO_VIDEO: '/demovideo',
  ENGAGEMENT_ENGINE: '/engagement-engine',
  INVESTORS: '/investors',
  PITCH: '/pitch',
  PLAYLISTS: '/playlists',
  LANDING_NEW: '/new',
  PRICING: '/pricing',
  LAUNCH: '/launch',
  /** Legacy campaign URL. Kept only for inbound-link compatibility; do not use for new navigation. */
  LAUNCH_PRICING: '/launch/pricing',
  CHANGELOG: '/changelog',
  DOWNLOAD: '/download',
  SUPPORT: '/support',
  PAY: '/pay',
  INSTANT_MERCH: '/instant-merch',

  // Legal
  LEGAL_PRIVACY: '/legal/privacy',
  LEGAL_TERMS: '/legal/terms',
  LEGAL_COOKIES: '/legal/cookies',
  LEGAL_DMCA: '/legal/dmca',

  // Auth & Onboarding
  SIGNIN: '/signin',
  SIGNUP: '/signup',
  /** Legacy Clerk hyphenated alias. */
  SIGNIN_HYPHEN: '/sign-in',
  SIGNUP_HYPHEN: '/sign-up',
  SSO_CALLBACK: '/sso-callback',
  SIGNIN_SSO_CALLBACK: '/signin/sso-callback',
  SIGNUP_SSO_CALLBACK: '/signup/sso-callback',
  SIGNIN_HYPHEN_SSO_CALLBACK: '/sign-in/sso-callback',
  SIGNUP_HYPHEN_SSO_CALLBACK: '/sign-up/sso-callback',
  /** Central auth handoff for web, iOS, and Electron clients. */
  AUTH_START: '/auth/start',
  AUTH_CALLBACK: '/auth/callback',
  /** Legacy native callback alias retained for older client builds. */
  LEGACY_APP_AUTH_CALLBACK: '/app/auth/callback',
  AUTH_NATIVE_COMPLETE: '/auth/native-complete',
  AUTH_IOS_COMPLETE: '/auth/ios/complete',
  AUTH_RETURN: '/auth-return',
  DESKTOP_AUTH: '/desktop-auth',
  MOBILE_AUTH_RETURN: '/mobile-auth-return',
  ONBOARDING: '/onboarding',
  ONBOARDING_CHECKOUT: '/onboarding/checkout',
  WAITLIST: '/waitlist',
  /** Anonymous onboarding chat (JOV-2132). Replaces /waitlist as the front door. */
  START: '/start',

  // Billing
  BILLING: '/billing',
  BILLING_SUCCESS: '/billing/success',
  BILLING_CANCEL: '/billing/cancel',
} as const;

export type AppRoute = (typeof APP_ROUTES)[keyof typeof APP_ROUTES];

function normalizeLyricsReturnRoute(
  candidate: string | null | undefined
): string | null {
  if (!candidate) return null;

  try {
    const url = new URL(candidate, 'https://jovie.local');
    const route = `${url.pathname}${url.search}`;

    if (!url.pathname.startsWith('/app')) {
      return null;
    }

    if (
      url.pathname === APP_ROUTES.LYRICS ||
      url.pathname.startsWith(`${APP_ROUTES.LYRICS}/`)
    ) {
      return null;
    }

    return route;
  } catch {
    return null;
  }
}

export function resolveLyricsReturnRoute(
  candidate: string | null | undefined,
  fallback: string = APP_ROUTES.LIBRARY
): string {
  return normalizeLyricsReturnRoute(candidate) ?? fallback;
}

export function buildLyricsRoute(
  trackId: string,
  options?: {
    readonly from?: string | null;
  }
): string {
  const route = `${APP_ROUTES.LYRICS}/${encodeURIComponent(trackId)}`;
  const returnTo = normalizeLyricsReturnRoute(options?.from);

  if (!returnTo) {
    return route;
  }

  return `${route}?from=${encodeURIComponent(returnTo)}`;
}

export function buildReleaseTasksRoute(releaseId: string): string {
  return `${APP_ROUTES.RELEASES}/${encodeURIComponent(releaseId)}/tasks`;
}

export function buildLibraryViewRoute(
  view?: 'releases' | 'merch' | 'images' | 'videos' | 'audio'
): string {
  if (!view) {
    return APP_ROUTES.LIBRARY;
  }

  return `${APP_ROUTES.LIBRARY}?view=${encodeURIComponent(view)}`;
}

export const buildWikiPageHref = (slug: string) =>
  `${APP_ROUTES.HUD_WIKI}/${encodeURIComponent(slug)}` as const;

export function isDemoRoutePath(pathname: string | null | undefined): boolean {
  return (
    typeof pathname === 'string' &&
    (pathname === APP_ROUTES.DEMO || pathname.startsWith(`${APP_ROUTES.DEMO}/`))
  );
}
