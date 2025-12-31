/**
 * Dashboard actions barrel export.
 *
 * This module re-exports all public APIs from domain-specific action modules,
 * providing a clean single import path for dashboard functionality.
 */

// Creator profile management server actions
export { publishProfileBasics, updateCreatorProfile } from './creator-profile';
// Core dashboard data fetching
export {
  type DashboardData,
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
// Social links types, constants, and server actions
export {
  DSP_PLATFORMS,
  type DspPlatform,
  getProfileSocialLinks,
  type ProfileSocialLink,
} from './social-links';
// Tipping statistics types and helpers
export { createEmptyTippingStats, type TippingStats } from './tipping-stats';
