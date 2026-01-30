/**
 * Centralized route constants for the Jovie application.
 *
 * IMPORTANT: These paths are domain-relative and work on app.jov.ie:
 * - On app.jov.ie: Clean paths like '/audience' work directly
 * - On jov.ie: Legacy '/app/*' paths redirect to app.jov.ie
 *
 * For external links (emails, Stripe callbacks), use getAppUrl() from constants/domains.ts
 */

// App routes - used for navigation on app.jov.ie (no /app prefix needed)
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
