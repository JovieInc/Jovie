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
  /** @deprecated Profile is now a drawer on the chat route. Use CHAT instead. */
  PROFILE: '/app/chat',
  CONTACTS: '/app/contacts',
  RELEASES: '/app/releases',
  TOUR_DATES: '/app/tour-dates',
  AUDIENCE: '/app/audience',
  EARNINGS: '/app/earnings',
  CHAT: '/app/chat',
  ANALYTICS: '/app/analytics',
  INSIGHTS: '/app/insights',

  // Settings
  SETTINGS: '/app/settings',
  SETTINGS_ARTIST_PROFILE: '/app/settings/artist-profile',
  SETTINGS_APPEARANCE: '/app/settings/appearance',
  SETTINGS_NOTIFICATIONS: '/app/settings/notifications',
  SETTINGS_BILLING: '/app/settings/billing',
  SETTINGS_CONTACTS: '/app/settings/contacts',
  SETTINGS_TOURING: '/app/settings/touring',
  SETTINGS_AUDIENCE: '/app/settings/audience',
  SETTINGS_RETARGETING_ADS: '/app/settings/retargeting-ads',

  // Admin
  ADMIN: '/app/admin',
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
  ADMIN_LEADS: '/app/admin/leads',
  ADMIN_OUTREACH: '/app/admin/outreach',
  ADMIN_OUTREACH_EMAIL: '/app/admin/outreach/email',
  ADMIN_OUTREACH_DM: '/app/admin/outreach/dm',
  ADMIN_OUTREACH_REVIEW: '/app/admin/outreach/review',
  ADMIN_SCREENSHOTS: '/app/admin/screenshots',

  // Marketing
  DEMO: '/demo',
  PRICING: '/pricing',
  LAUNCH: '/launch',
  LAUNCH_PRICING: '/launch/pricing',

  // Legal
  LEGAL_PRIVACY: '/legal/privacy',
  LEGAL_TERMS: '/legal/terms',
  LEGAL_COOKIES: '/legal/cookies',

  // Auth & Onboarding
  SIGNIN: '/signin',
  SIGNUP: '/signup',
  ONBOARDING: '/onboarding',
  WAITLIST: '/waitlist',

  // Billing
  BILLING: '/billing',
  BILLING_REMOVE_BRANDING: '/billing/remove-branding',
  BILLING_SUCCESS: '/billing/success',
  BILLING_CANCEL: '/billing/cancel',

  // Referrals
  REFERRALS: '/app/referrals',
} as const;

export type AppRoute = (typeof APP_ROUTES)[keyof typeof APP_ROUTES];
