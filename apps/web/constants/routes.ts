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
  DASHBOARD_OVERVIEW: '/app/dashboard',
  DASHBOARD_EARNINGS: '/app/dashboard/earnings',
  DASHBOARD_LINKS: '/app/dashboard/links',
  DASHBOARD_PROFILE: '/app/dashboard/profile',
  DASHBOARD_AUDIENCE: '/app/dashboard/audience',
  DASHBOARD_RELEASES: '/app/dashboard/releases',
  DASHBOARD_TASKS: '/app/dashboard/tasks',
  DASHBOARD_RELEASE_TASKS: '/app/dashboard/releases/[releaseId]/tasks',
  DASHBOARD_TIPPING: '/app/dashboard/tipping',
  DASHBOARD_CONTACTS: '/app/dashboard/contacts',
  DASHBOARD_TOUR_DATES: '/app/dashboard/tour-dates',
  /** @deprecated Profile is now a drawer on the chat route. Use CHAT instead. */
  PROFILE: '/app/chat',
  CONTACTS: '/app/contacts',
  RELEASES: '/app/releases',
  TOUR_DATES: '/app/tour-dates',
  AUDIENCE: '/app/audience',
  EARNINGS: '/app/earnings',
  TASKS: '/app/dashboard/tasks',
  CHAT: '/app/chat',
  CHAT_PROFILE_PANEL: '/app/chat?panel=profile',
  INSIGHTS: '/app/insights',
  PRESENCE: '/app/presence',

  // Settings
  SETTINGS: '/app/settings',
  SETTINGS_ACCOUNT: '/app/settings/account',
  SETTINGS_ARTIST_PROFILE: '/app/settings/artist-profile',
  SETTINGS_APPEARANCE: '/app/settings/appearance',
  SETTINGS_NOTIFICATIONS: '/app/settings/notifications',
  SETTINGS_BILLING: '/app/settings/billing',
  SETTINGS_PAYMENTS: '/app/settings/payments',
  SETTINGS_DATA_PRIVACY: '/app/settings/data-privacy',
  SETTINGS_CONTACTS: '/app/settings/contacts',
  SETTINGS_TOURING: '/app/settings/touring',
  SETTINGS_AUDIENCE: '/app/settings/audience',
  SETTINGS_ANALYTICS: '/app/settings/analytics',
  SETTINGS_ADMIN: '/app/settings/admin',
  /** @deprecated Use SETTINGS_DATA_PRIVACY instead */
  SETTINGS_DELETE_ACCOUNT: '/app/settings/delete-account',

  // Admin
  ADMIN: '/app/admin',
  ADMIN_PEOPLE: '/app/admin/people',
  ADMIN_GROWTH: '/app/admin/growth',
  ADMIN_WAITLIST: '/app/admin/waitlist',
  ADMIN_WAITLIST_SETTINGS: '/app/admin/waitlist/settings',
  ADMIN_FEEDBACK: '/app/admin/feedback',
  ADMIN_CREATORS: '/app/admin/creators',
  ADMIN_CREATORS_BULK_REFRESH: '/app/admin/creators/bulk-refresh',
  ADMIN_CREATORS_DELETE: '/app/admin/creators/delete',
  ADMIN_CREATORS_TOGGLE_FEATURED: '/app/admin/creators/toggle-featured',
  ADMIN_CREATORS_TOGGLE_MARKETING: '/app/admin/creators/toggle-marketing',
  ADMIN_CREATORS_TOGGLE_VERIFY: '/app/admin/creators/toggle-verify',
  ADMIN_USERS: '/app/admin/users',
  ADMIN_ACTIVITY: '/app/admin/activity',
  ADMIN_CAMPAIGNS: '/app/admin/campaigns',
  ADMIN_GROWTH_YC_METRICS: '/app/admin/growth/yc-metrics',
  ADMIN_INVESTORS: '/app/admin/investors',
  ADMIN_INVESTORS_LINKS: '/app/admin/investors/links',
  ADMIN_INVESTORS_SETTINGS: '/app/admin/investors/settings',
  ADMIN_LEADS: '/app/admin/leads',
  ADMIN_OUTREACH: '/app/admin/outreach',
  ADMIN_OUTREACH_EMAIL: '/app/admin/outreach/email',
  ADMIN_OUTREACH_DM: '/app/admin/outreach/dm',
  ADMIN_OUTREACH_REVIEW: '/app/admin/outreach/review',
  ADMIN_INGEST: '/app/admin/ingest',
  ADMIN_SCREENSHOTS: '/app/admin/screenshots',
  ADMIN_SHARE_STUDIO: '/app/admin/share-studio',
  ADMIN_RELEASES: '/app/admin/releases',
  ADMIN_USERS_BAN: '/app/admin/users/ban',
  ADMIN_USERS_UNBAN: '/app/admin/users/unban',
  ADMIN_ALGORITHM_HEALTH: '/app/admin/algorithm-health',
  ADMIN_PLAYLISTS: '/app/admin/playlists',
  ADMIN_PLATFORM_CONNECTIONS: '/app/admin/platform-connections',

  // System
  UNAVAILABLE: '/unavailable',

  // Marketing
  HOME: '/',
  ABOUT: '/about',
  AI: '/ai',
  ALTERNATIVES: '/alternatives',
  ARTIST_NOTIFICATIONS: '/artist-notifications',
  ARTIST_PROFILES: '/artist-profiles',
  BLOG: '/blog',
  BLOG_THE_CONTACT_PROBLEM: '/blog/the-contact-problem',
  BLOG_THE_MYSPACE_PROBLEM: '/blog/the-myspace-problem',
  COMPARE: '/compare',
  DEMO: '/demo',
  DEMO_VIDEO: '/demo/video',
  ENGAGEMENT_ENGINE: '/engagement-engine',
  INVESTORS: '/investors',
  LANDING_NEW: '/new',
  PRICING: '/pricing',
  LAUNCH: '/launch',
  LAUNCH_PRICING: '/launch/pricing',
  CHANGELOG: '/changelog',
  SUPPORT: '/support',
  PAY: '/pay',

  // Legal
  LEGAL_PRIVACY: '/legal/privacy',
  LEGAL_TERMS: '/legal/terms',
  LEGAL_COOKIES: '/legal/cookies',
  LEGAL_DMCA: '/legal/dmca',

  // Auth & Onboarding
  SIGNIN: '/signin',
  SIGNUP: '/signup',
  ONBOARDING: '/onboarding',
  ONBOARDING_CHECKOUT: '/onboarding/checkout',
  WAITLIST: '/waitlist',

  // Billing
  BILLING: '/billing',
  BILLING_SUCCESS: '/billing/success',
  BILLING_CANCEL: '/billing/cancel',
} as const;

export type AppRoute = (typeof APP_ROUTES)[keyof typeof APP_ROUTES];

export function isDemoRoutePath(pathname: string | null | undefined): boolean {
  return (
    typeof pathname === 'string' &&
    (pathname === APP_ROUTES.DEMO || pathname.startsWith(`${APP_ROUTES.DEMO}/`))
  );
}
