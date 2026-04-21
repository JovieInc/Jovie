/**
 * Shared type definitions for admin modules.
 *
 * This file re-exports type-only definitions from server-side admin modules
 * so that client components can import types without pulling in server-only code.
 *
 * IMPORTANT: Only export types from this file. Do not import or re-export
 * runtime values — those belong in their respective server modules.
 */

// bragging-rights
export type { AdminBraggingRights } from './bragging-rights';

// creator-profiles
export type {
  AdminCreatorProfileRow,
  AdminCreatorProfilesSort,
} from './creator-profiles';

// funnel-metrics
export type { AdminFunnelMetrics } from './funnel-metrics';

// overview
export type {
  AdminActivityItem,
  AdminActivityStatus,
  AdminUsagePoint,
} from './overview';

// platform-stats
export type { AdminPlatformStats } from './platform-stats';

// product-funnel
export type {
  AdminProductFunnelAlert,
  AdminProductFunnelDashboard,
  AdminProductFunnelExternalEngagementMetrics,
  AdminProductFunnelStage,
  ProductFunnelTimeRange,
  SyntheticMonitorStatus,
} from './product-funnel';

// releases
export type { AdminReleaseRow, AdminReleasesSort } from './releases';

// reliability
export type { AdminReliabilitySummary } from './reliability';

// screenshots
export type { ScreenshotInfo } from './screenshots';

// sentry-metrics
export type { AdminSentryMetrics } from './sentry-metrics';

// users
export type { AdminUserRow, AdminUsersSort } from './users';

// waitlist
export type { WaitlistEntryRow, WaitlistMetrics } from './waitlist';
