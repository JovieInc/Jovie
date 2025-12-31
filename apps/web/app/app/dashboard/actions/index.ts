/**
 * Dashboard actions barrel export.
 *
 * This module re-exports all public APIs from domain-specific action modules,
 * providing a clean single import path for dashboard functionality.
 */

// Tipping statistics types and helpers
export { type TippingStats, createEmptyTippingStats } from './tipping-stats';

// Profile selection logic
export { profileIsPublishable, selectDashboardProfile } from './profile-selection';

// Social links types, constants, and server actions
export {
  type ProfileSocialLink,
  type DspPlatform,
  DSP_PLATFORMS,
  getProfileSocialLinks,
} from './social-links';

// User dashboard settings server actions
export { setSidebarCollapsed } from './settings';

// Creator profile management server actions
export { updateCreatorProfile, publishProfileBasics } from './creator-profile';

// Core dashboard data fetching
export {
  type DashboardData,
  prefetchDashboardData,
  getDashboardData,
  getDashboardDataFresh,
  getDashboardDataCached,
} from './dashboard-data';
