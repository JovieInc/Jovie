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
  DASHBOARD: '/',
  PROFILE: '/profile',
  CONTACTS: '/contacts',
  RELEASES: '/releases',
  TOUR_DATES: '/tour-dates',
  AUDIENCE: '/audience',
  EARNINGS: '/earnings',
  CHAT: '/chat',
  ANALYTICS: '/analytics',

  // Settings
  SETTINGS: '/settings',
  SETTINGS_APPEARANCE: '/settings/appearance',
  SETTINGS_NOTIFICATIONS: '/settings/notifications',
  SETTINGS_BRANDING: '/settings/branding',
  SETTINGS_AD_PIXELS: '/settings/ad-pixels',
  SETTINGS_BILLING: '/settings/billing',

  // Admin
  ADMIN: '/admin',
  ADMIN_WAITLIST: '/admin/waitlist',
  ADMIN_CREATORS: '/admin/creators',
  ADMIN_USERS: '/admin/users',
  ADMIN_ACTIVITY: '/admin/activity',

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
