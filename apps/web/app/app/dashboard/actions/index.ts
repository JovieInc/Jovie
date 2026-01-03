/**
 * Dashboard actions barrel export.
 *
 * This module re-exports server actions only. Types and constants should be
 * imported directly from their source modules to avoid "use server" conflicts.
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

// Profile selection logic
export {
  profileIsPublishable,
  selectDashboardProfile,
} from './profile-selection';

// User dashboard settings server actions
export { setSidebarCollapsed } from './settings';

// Social links server actions
export { getProfileSocialLinks } from './social-links';

// Tipping statistics helpers
export { createEmptyTippingStats } from './tipping-stats';

// Types and constants should be imported directly from source modules:
// - import type { DashboardData } from './dashboard-data';
// - import type { DspPlatform, ProfileSocialLink } from './social-links';
// - import { DSP_PLATFORMS } from './social-links';
// - import type { TippingStats } from './tipping-stats';
