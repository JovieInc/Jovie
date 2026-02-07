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
