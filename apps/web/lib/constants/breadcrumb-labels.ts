/**
 * Centralized breadcrumb label map.
 * Uses sentence case (only first word capitalized) for consistency.
 *
 * Add new routes here to ensure consistent breadcrumb display.
 */
export const BREADCRUMB_LABELS: Record<string, string> = {
  // Dashboard routes
  dashboard: 'Dashboard',
  profile: 'Profile',
  contacts: 'Contacts',
  releases: 'Releases',
  audience: 'Audience',
  earnings: 'Earnings',
  analytics: 'Analytics',
  chat: 'Chat',
  'tour-dates': 'Tour dates',

  // Settings routes
  settings: 'Settings',
  appearance: 'Appearance',
  notifications: 'Notifications',
  branding: 'Branding',
  'ad-pixels': 'Ad pixels',
  billing: 'Billing',

  // Admin routes
  admin: 'Admin',
  waitlist: 'Waitlist',
  creators: 'Creators',
  users: 'Users',
  activity: 'Activity',
  campaigns: 'Campaigns',

  // Root routes
  app: 'Dashboard',
} as const;

/**
 * Get breadcrumb label for a route segment.
 * Falls back to sentence case conversion if not in map.
 */
export function getBreadcrumbLabel(segment: string): string {
  if (segment in BREADCRUMB_LABELS) {
    return BREADCRUMB_LABELS[segment];
  }
  // Fallback: convert "some-route" to "Some route" (sentence case)
  return segment.replaceAll('-', ' ').replace(/^\w/, c => c.toUpperCase());
}
