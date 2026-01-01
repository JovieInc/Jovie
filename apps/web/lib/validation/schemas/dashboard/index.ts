/**
 * Dashboard Validation Schemas
 *
 * Centralized exports for all dashboard API validation schemas.
 *
 * @see /api/dashboard/profile
 * @see /api/dashboard/social-links
 * @see /api/dashboard/audience/members
 * @see /api/dashboard/audience/subscribers
 * @see /api/dashboard/activity/recent
 */

// Activity schemas
export {
  type ActivityRange,
  activityRangeSchema,
  activityRangeValues,
  type RecentActivityQueryParams,
  recentActivityQuerySchema,
} from './activity';
// Audience schemas
export {
  type MemberSort,
  type MembersQueryParams,
  memberSortSchema,
  memberSortValues,
  membersQuerySchema,
  type SortDirection,
  type SubscriberSort,
  type SubscribersQueryParams,
  sortDirectionSchema,
  sortDirectionValues,
  subscriberSortSchema,
  subscriberSortValues,
  subscribersQuerySchema,
} from './audience';
// Profile schemas
export {
  type CreatorType,
  creatorTypeSchema,
  creatorTypeValues,
  type ProfileSettings,
  type ProfileUpdatePayload,
  profileUpdateSchema,
  settingsSchema,
  type ThemePreference,
  themeSchema,
  type VenmoHandle,
  venmoHandleSchema,
} from './profile';
// Social links schemas
export {
  type LinkAction,
  type LinkEvidence,
  type LinkState,
  linkActionSchema,
  linkActionValues,
  linkEvidenceSchema,
  linkStateSchema,
  linkStateValues,
  type SocialLinkInput,
  type SourceType,
  socialLinkInputSchema,
  sourceTypeSchema,
  sourceTypeValues,
  type UpdateLinkStatePayload,
  type UpdateSocialLinksPayload,
  updateLinkStateSchema,
  updateSocialLinksSchema,
} from './social-links';
