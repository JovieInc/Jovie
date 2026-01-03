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
 * - profileIsPublishable()
 * - selectDashboardProfile()
 * - createEmptyTippingStats()
 * - TippingStats interface
 *
 * Constants are in their canonical locations:
 * - DSP_PLATFORMS, DspPlatform from @/lib/services/social-links/types
 */

// Creator profile management server actions
export { publishProfileBasics, updateCreatorProfile } from './creator-profile';

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

// Import non-async utilities directly from their new locations:
// - import { profileIsPublishable, selectDashboardProfile } from '@/lib/db/server';
// - import { createEmptyTippingStats, type TippingStats } from '@/lib/db/server';
// - import { DSP_PLATFORMS, type DspPlatform } from '@/lib/services/social-links/types';
// - import type { DashboardData } from './dashboard-data';
// - import type { ProfileSocialLink } from './social-links';
