/**
 * Centralized Schema Library
 *
 * This barrel file re-exports all validation schemas from the centralized
 * schema library. Schemas are organized by domain and pre-instantiated
 * at module load time to avoid per-request construction overhead.
 *
 * Usage:
 * ```typescript
 * // Import individual schemas
 * import { clickSchema, visitSchema } from '@/lib/validation/schemas';
 *
 * // Import all schemas from a domain namespace
 * import { audience, dashboard, admin } from '@/lib/validation/schemas';
 * const result = audience.clickSchema.safeParse(data);
 *
 * // Import types
 * import type { ClickPayload, VisitPayload } from '@/lib/validation/schemas';
 * ```
 *
 * @module @/lib/validation/schemas
 */

// =============================================================================
// Base Schemas
// =============================================================================

export {
  // Types
  type DeviceType,
  // Schema instances
  deviceTypeSchema,
  httpUrlSchema,
  type LinkType,
  linkTypeSchema,
  type Metadata,
  metadataSchema,
  optionalDeviceTypeSchema,
  optionalHttpUrlSchema,
  optionalMetadataSchema,
  optionalUuidSchema,
  // SSRF-safe URL schema for server-side fetches
  safeHttpUrlSchema,
  uuidSchema,
} from './base';

// =============================================================================
// Audience Schemas (Hot-Path)
// =============================================================================

export {
  // Types
  type ClickPayload,
  // Schema instances
  clickSchema,
  type VisitPayload,
  visitSchema,
} from './audience';

// =============================================================================
// Dashboard Schemas
// =============================================================================

export {
  type ActivityRange,
  activityRangeSchema,
  // Recent activity schemas
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
  // Social links schemas
  linkStateValues,
  type MemberSort,
  type MembersQueryParams,
  memberSortSchema,
  // Audience members schemas
  memberSortValues,
  membersQuerySchema,
  // Types
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
  // Profile schemas
  settingsSchema,
  socialLinkInputSchema,
  sortDirectionSchema,
  sortDirectionValues,
  sourceTypeSchema,
  sourceTypeValues,
  subscriberSortSchema,
  // Subscribers schemas
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
} from './dashboard';

// =============================================================================
// Admin Schemas
// =============================================================================

export {
  // Types
  type AdminRole,
  // Role management schemas
  adminRoleLiteral,
  type CreatorIngestPayload,
  // Creator ingestion schemas
  creatorIngestSchema,
  type GrantRolePayload,
  grantRoleSchema,
  type IngestionRerunPayload,
  ingestionRerunSchema,
  type RevokeRolePayload,
  revokeRoleSchema,
  type WaitlistApprovePayload,
  type WaitlistGoal,
  type WaitlistInviteSendWindowConfig,
  type WaitlistPlan,
  type WaitlistRequestPayload,
  waitlistApproveSchema,
  waitlistGoalSchema,
  // Waitlist schemas
  waitlistGoalValues,
  // Cron job schemas
  waitlistInviteSendWindowSchema,
  waitlistPlanSchema,
  waitlistPlanValues,
  waitlistRequestSchema,
} from './admin';

// =============================================================================
// Payment Schemas
// =============================================================================

export {
  // Types
  type TipIntentPayload,
  // Tip intent schemas
  tipIntentSchema,
} from './payments';

// =============================================================================
// Media Schemas
// =============================================================================

export {
  // Types
  type ImageUploadPayload,
  // Image upload schemas
  imageUploadSchema,
} from './media';

// =============================================================================
// Account Schemas
// =============================================================================

export {
  // Types
  type AccountEmailSyncPayload,
  // Email sync schemas
  accountEmailSyncSchema,
} from './account';

// =============================================================================
// Notification Schemas
// =============================================================================

export {
  // Types
  type NotificationChannel,
  // Channel/method schemas
  notificationChannelSchema,
  type StatusInput,
  type SubscribeInput,
  // Notification schemas
  statusSchema,
  subscribeSchema,
  type UnsubscribeInput,
  type UnsubscribeMethod,
  unsubscribeMethodSchema,
  unsubscribeSchema,
} from './notifications';

// =============================================================================
// Onboarding Schemas
// =============================================================================

export {
  // Individual field schemas
  fullNameSchema,
  handleSchema,
  // Types
  type OnboardingValues,
  // Onboarding form schema
  onboardingSchema,
} from './onboarding';

// =============================================================================
// Ingestion Schemas
// =============================================================================

export {
  type BeaconsJobPayload,
  type BeaconsPayload,
  beaconsJobPayloadSchema,
  beaconsPayloadSchema,
  // Constants
  INGESTION_MAX_DEPTH,
  type LayloJobPayload,
  type LayloPayload,
  // Types - job payloads
  type LinktreeJobPayload,
  // Types - base payloads
  type LinktreePayload,
  layloJobPayloadSchema,
  layloPayloadSchema,
  // Job payload schemas (dedupKey required - for jobs.ts)
  linktreeJobPayloadSchema,
  // Base payload schemas (dedupKey optional - for processor.ts)
  linktreePayloadSchema,
  type ThematicJobPayload,
  type ThematicPayload,
  thematicJobPayloadSchema,
  thematicPayloadSchema,
  type YouTubeJobPayload,
  type YouTubePayload,
  youtubeJobPayloadSchema,
  youtubePayloadSchema,
} from './ingestion';

// =============================================================================
// Namespace Exports
// =============================================================================

import * as account from './account';
import * as admin from './admin';
import * as audience from './audience';
/**
 * Re-export modules as namespaces for alternative import patterns.
 *
 * Usage:
 * ```typescript
 * import { audience, dashboard, admin, payments, media, account, onboarding, ingestion } from '@/lib/validation/schemas';
 * audience.clickSchema.safeParse(data);
 * ingestion.linktreePayloadSchema.safeParse(data);
 * ```
 */
import * as base from './base';
import * as dashboard from './dashboard';
import * as ingestion from './ingestion';
import * as media from './media';
import * as notifications from './notifications';
import * as onboarding from './onboarding';
import * as payments from './payments';

export {
  base,
  audience,
  dashboard,
  admin,
  payments,
  media,
  account,
  notifications,
  onboarding,
  ingestion,
};
