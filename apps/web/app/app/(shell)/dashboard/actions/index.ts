/**
 * Dashboard actions barrel export.
 *
 * IMPORTANT: This file does NOT have "use server" directive.
 * It only re-exports server actions that are already marked with "use server"
 * in their source files.
 *
 * This barrel exports ONLY async server actions. Non-async utilities have been
 * moved to @/lib/db/server to comply with Next.js "use server" requirements.
 *
 * Non-async utilities are now in @/lib/db/server:
 * - selectDashboardProfile()
 * - profileIsPublishable()
 * - createEmptyTippingStats()
 * - TippingStats interface
 *
 * Constants are in their canonical locations:
 * - DSP_PLATFORMS, DspPlatform from @/lib/services/social-links/types
 */

// Creator profile management server actions
export {
  publishProfileBasics,
  updateAllowProfilePhotoDownloads,
  updateCreatorProfile,
} from './creator-profile';

// Core dashboard data fetching
export {
  getDashboardData,
  getDashboardDataCached,
  getDashboardDataFresh,
  prefetchDashboardData,
} from './dashboard-data';

// User dashboard settings server actions
export { setSidebarCollapsed } from './settings';

// Social links server actions
export { getProfileSocialLinks } from './social-links';

// Types, constants, and utility functions should be imported directly from source modules:
// - import type { DashboardData } from './dashboard-data';
// - import type { DspPlatform, ProfileSocialLink } from './social-links';
// - import { DSP_PLATFORMS } from './social-links';
// - import { selectDashboardProfile, profileIsPublishable, createEmptyTippingStats } from '@/lib/db/server';
// - import type { TippingStats } from '@/lib/db/server';
