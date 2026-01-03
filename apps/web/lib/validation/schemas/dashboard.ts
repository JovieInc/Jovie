/**
 * Dashboard Validation Schemas
 *
 * @deprecated This file is maintained for backwards compatibility.
 * Import from '@/lib/validation/schemas/dashboard/' for new code.
 *
 * Schemas for /api/dashboard/* routes.
 */

// Re-export everything from the modular structure for backwards compatibility
export {
  type ActivityRange,
  activityRangeSchema,
  activityRangeValues,
  type CreatorType,
  creatorTypeSchema,
  creatorTypeValues,
  type LinkAction,
  type LinkEvidence,
  type LinkState,
  linkActionSchema,
  linkActionValues,
  linkEvidenceSchema,
  linkStateSchema,
  linkStateValues,
  type MemberSort,
  type MembersQueryParams,
  memberSortSchema,
  memberSortValues,
  membersQuerySchema,
  type ProfileSettings,
  type ProfileUpdatePayload,
  profileUpdateSchema,
  type RecentActivityQueryParams,
  recentActivityQuerySchema,
  type SocialLinkInput,
  type SortDirection,
  type SourceType,
  type SubscriberSort,
  type SubscribersQueryParams,
  settingsSchema,
  socialLinkInputSchema,
  sortDirectionSchema,
  sortDirectionValues,
  sourceTypeSchema,
  sourceTypeValues,
  subscriberSortSchema,
  subscriberSortValues,
  subscribersQuerySchema,
  type ThemePreference,
  themeSchema,
  type UpdateLinkStatePayload,
  type UpdateSocialLinksPayload,
  updateLinkStateSchema,
  updateSocialLinksSchema,
  type VenmoHandle,
  venmoHandleSchema,
} from './dashboard/index';
