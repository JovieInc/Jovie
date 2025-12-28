/**
 * Database Schema - Barrel Export
 *
 * Re-exports all tables, enums, Zod schemas, and types from domain modules.
 * This file maintains backward compatibility with the original schema.ts.
 *
 * Domain modules:
 * - shared/enums: Cross-domain enums (ingestionStatus, ingestionSourceType)
 * - users: User identity and settings
 * - creators: Creator profiles, contacts, social presence
 * - catalog: Music catalog (providers, releases, tracks, smart links)
 * - analytics: Audience tracking and click events
 * - billing: Payments, tips, Stripe integration
 * - notifications: Fan notification subscriptions
 * - waitlist: Invite-only access management
 * - infrastructure: System utilities, job queues, link wrapping
 */

// ============================================================================
// Re-export all domain modules
// ============================================================================

// Analytics domain
export {
  audienceDeviceTypeEnum,
  audienceIntentLevelEnum,
  audienceMembers,
  audienceMemberTypeEnum,
  clickEvents,
  linkTypeEnum,
} from './analytics';
// Billing domain
export {
  billingAuditLog,
  currencyCodeEnum,
  stripeWebhookEvents,
  tips,
} from './billing';
// Catalog domain
export {
  discogReleases,
  discogReleaseTypeEnum,
  discogTracks,
  providerKindEnum,
  providerLinkOwnerEnum,
  providerLinks,
  providers,
  smartLinkTargets,
} from './catalog';
// Creators domain
export {
  contactChannelEnum,
  contactRoleEnum,
  creatorContacts,
  creatorProfiles,
  creatorTypeEnum,
  photoStatusEnum,
  profilePhotos,
  socialAccountStatusEnum,
  socialAccounts,
  socialLinkStateEnum,
  socialLinks,
} from './creators';
// Infrastructure domain
export {
  dashboardIdempotencyKeys,
  ingestionJobStatusEnum,
  ingestionJobs,
  scraperConfigs,
  scraperStrategyEnum,
  signedLinkAccess,
  wrappedLinks,
} from './infrastructure';
// Notifications domain
export {
  notificationChannelEnum,
  notificationSubscriptions,
} from './notifications';
// Shared enums (used across multiple domains)
export {
  ingestionSourceTypeEnum,
  ingestionStatusEnum,
} from './shared/enums';
// Users domain
export {
  subscriptionPlanEnum,
  subscriptionStatusEnum,
  themeModeEnum,
  userSettings,
  users,
} from './users';
// Waitlist domain
export {
  waitlistEntries,
  waitlistInviteStatusEnum,
  waitlistInvites,
  waitlistStatusEnum,
} from './waitlist';

// ============================================================================
// Re-export Zod Validation Schemas
// ============================================================================

export {
  // Analytics domain
  insertAudienceMemberSchema,
  insertBillingAuditLogSchema,
  insertClickEventSchema,
  insertCreatorContactSchema,
  // Creators domain
  insertCreatorProfileSchema,
  // Infrastructure domain
  insertDashboardIdempotencyKeySchema,
  insertDiscogReleaseSchema,
  insertDiscogTrackSchema,
  insertIngestionJobSchema,
  // Notifications domain
  insertNotificationSubscriptionSchema,
  insertProfilePhotoSchema,
  insertProviderLinkSchema,
  // Catalog domain
  insertProviderSchema,
  insertScraperConfigSchema,
  insertSignedLinkAccessSchema,
  insertSmartLinkTargetSchema,
  insertSocialAccountSchema,
  insertSocialLinkSchema,
  insertStripeWebhookEventSchema,
  // Billing domain
  insertTipSchema,
  // Users domain
  insertUserSchema,
  insertUserSettingsSchema,
  // Waitlist domain
  insertWaitlistEntrySchema,
  insertWaitlistInviteSchema,
  insertWrappedLinkSchema,
  selectAudienceMemberSchema,
  selectBillingAuditLogSchema,
  selectClickEventSchema,
  selectCreatorContactSchema,
  selectCreatorProfileSchema,
  selectDashboardIdempotencyKeySchema,
  selectDiscogReleaseSchema,
  selectDiscogTrackSchema,
  selectIngestionJobSchema,
  selectNotificationSubscriptionSchema,
  selectProfilePhotoSchema,
  selectProviderLinkSchema,
  selectProviderSchema,
  selectScraperConfigSchema,
  selectSignedLinkAccessSchema,
  selectSmartLinkTargetSchema,
  selectSocialAccountSchema,
  selectSocialLinkSchema,
  selectStripeWebhookEventSchema,
  selectTipSchema,
  selectUserSchema,
  selectUserSettingsSchema,
  selectWaitlistEntrySchema,
  selectWaitlistInviteSchema,
  selectWrappedLinkSchema,
} from './validation';

import { audienceMembers, clickEvents } from './analytics';
import { billingAuditLog, stripeWebhookEvents, tips } from './billing';
import {
  discogReleases,
  discogTracks,
  providerLinks,
  providers,
  smartLinkTargets,
} from './catalog';
import {
  creatorContacts,
  creatorProfiles,
  profilePhotos,
  socialAccounts,
  socialLinks,
} from './creators';
import {
  dashboardIdempotencyKeys,
  ingestionJobs,
  scraperConfigs,
  signedLinkAccess,
  wrappedLinks,
} from './infrastructure';
import { notificationSubscriptions } from './notifications';
// Import tables for TypeScript type generation
import { userSettings, users } from './users';
import { waitlistEntries, waitlistInvites } from './waitlist';

// ============================================================================
// TypeScript Types (inferred from tables)
// ============================================================================

// Users
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// Providers
export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;

// Creator Profiles
export type CreatorProfile = typeof creatorProfiles.$inferSelect;
export type NewCreatorProfile = typeof creatorProfiles.$inferInsert;

// Discog Releases
export type DiscogRelease = typeof discogReleases.$inferSelect;
export type NewDiscogRelease = typeof discogReleases.$inferInsert;

// Discog Tracks
export type DiscogTrack = typeof discogTracks.$inferSelect;
export type NewDiscogTrack = typeof discogTracks.$inferInsert;

// Provider Links
export type ProviderLink = typeof providerLinks.$inferSelect;
export type NewProviderLink = typeof providerLinks.$inferInsert;

// Smart Link Targets
export type SmartLinkTarget = typeof smartLinkTargets.$inferSelect;
export type NewSmartLinkTarget = typeof smartLinkTargets.$inferInsert;

// Social Links
export type SocialLink = typeof socialLinks.$inferSelect;
export type NewSocialLink = typeof socialLinks.$inferInsert;

// Creator Contacts
export type CreatorContact = typeof creatorContacts.$inferSelect;
export type NewCreatorContact = typeof creatorContacts.$inferInsert;

// Click Events
export type ClickEvent = typeof clickEvents.$inferSelect;
export type NewClickEvent = typeof clickEvents.$inferInsert;

// Notification Subscriptions
export type NotificationSubscription =
  typeof notificationSubscriptions.$inferSelect;
export type NewNotificationSubscription =
  typeof notificationSubscriptions.$inferInsert;

// Tips
export type Tip = typeof tips.$inferSelect;
export type NewTip = typeof tips.$inferInsert;

// Signed Link Access
export type SignedLinkAccess = typeof signedLinkAccess.$inferSelect;
export type NewSignedLinkAccess = typeof signedLinkAccess.$inferInsert;

// Wrapped Links
export type WrappedLink = typeof wrappedLinks.$inferSelect;
export type NewWrappedLink = typeof wrappedLinks.$inferInsert;

// Stripe Webhook Events
export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;
export type NewStripeWebhookEvent = typeof stripeWebhookEvents.$inferInsert;

// User Settings
export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;

// Profile Photos
export type ProfilePhoto = typeof profilePhotos.$inferSelect;
export type NewProfilePhoto = typeof profilePhotos.$inferInsert;

// Social Accounts
export type SocialAccount = typeof socialAccounts.$inferSelect;
export type NewSocialAccount = typeof socialAccounts.$inferInsert;

// Ingestion Jobs
export type IngestionJob = typeof ingestionJobs.$inferSelect;
export type NewIngestionJob = typeof ingestionJobs.$inferInsert;

// Scraper Configs
export type ScraperConfig = typeof scraperConfigs.$inferSelect;
export type NewScraperConfig = typeof scraperConfigs.$inferInsert;

// Waitlist Entries
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type NewWaitlistEntry = typeof waitlistEntries.$inferInsert;

// Waitlist Invites
export type WaitlistInvite = typeof waitlistInvites.$inferSelect;
export type NewWaitlistInvite = typeof waitlistInvites.$inferInsert;

// Dashboard Idempotency Keys
export type DashboardIdempotencyKey =
  typeof dashboardIdempotencyKeys.$inferSelect;
export type NewDashboardIdempotencyKey =
  typeof dashboardIdempotencyKeys.$inferInsert;

// Billing Audit Log
export type BillingAuditLog = typeof billingAuditLog.$inferSelect;
export type NewBillingAuditLog = typeof billingAuditLog.$inferInsert;

// Audience Members
export type AudienceMember = typeof audienceMembers.$inferSelect;
export type NewAudienceMember = typeof audienceMembers.$inferInsert;
