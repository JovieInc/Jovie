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
  PROFILE: '/app/profile',
  CONTACTS: '/app/contacts',
  RELEASES: '/app/releases',
  TOUR_DATES: '/app/tour-dates',
  AUDIENCE: '/app/audience',
  EARNINGS: '/app/earnings',
  CHAT: '/app/chat',
  ANALYTICS: '/app/analytics',

  // Settings
  SETTINGS: '/app/settings',
  SETTINGS_ARTIST_PROFILE: '/app/settings/artist-profile',
  SETTINGS_APPEARANCE: '/app/settings/appearance',
  SETTINGS_NOTIFICATIONS: '/app/settings/notifications',
  SETTINGS_BRANDING: '/app/settings/branding',
  SETTINGS_AD_PIXELS: '/app/settings/ad-pixels',
  SETTINGS_BILLING: '/app/settings/billing',
  SETTINGS_SOCIAL_LINKS: '/app/settings/social-links',
  SETTINGS_MUSIC_LINKS: '/app/settings/music-links',

  // Admin
  ADMIN: '/app/admin',
  ADMIN_WAITLIST: '/app/admin/waitlist',
  ADMIN_CREATORS: '/app/admin/creators',
  ADMIN_CREATORS_BULK_REFRESH: '/app/admin/creators/bulk-refresh',
  ADMIN_CREATORS_DELETE: '/app/admin/creators/delete',
  ADMIN_CREATORS_TOGGLE_FEATURED: '/app/admin/creators/toggle-featured',
  ADMIN_CREATORS_TOGGLE_MARKETING: '/app/admin/creators/toggle-marketing',
  ADMIN_CREATORS_TOGGLE_VERIFY: '/app/admin/creators/toggle-verify',
  ADMIN_USERS: '/app/admin/users',
  ADMIN_ACTIVITY: '/app/admin/activity',

  // Auth & Onboarding
  SIGNIN: '/signin',
  SIGNUP: '/signup',
  ONBOARDING: '/onboarding',
  WAITLIST: '/waitlist',

  // Billing
  BILLING: '/billing',
  BILLING_SUCCESS: '/billing/success',
  BILLING_CANCEL: '/billing/cancel',
} as const;

export type AppRoute = (typeof APP_ROUTES)[keyof typeof APP_ROUTES];
