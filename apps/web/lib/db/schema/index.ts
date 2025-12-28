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

import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

// ============================================================================
// Re-export all domain modules
// ============================================================================

// Shared enums (used across multiple domains)
export {
  ingestionStatusEnum,
  ingestionSourceTypeEnum,
} from './shared/enums';

// Users domain
export {
  themeModeEnum,
  subscriptionPlanEnum,
  subscriptionStatusEnum,
  users,
  userSettings,
} from './users';

// Creators domain
export {
  creatorTypeEnum,
  contactRoleEnum,
  contactChannelEnum,
  socialLinkStateEnum,
  socialAccountStatusEnum,
  photoStatusEnum,
  creatorProfiles,
  creatorContacts,
  socialLinks,
  socialAccounts,
  profilePhotos,
} from './creators';

// Catalog domain
export {
  providerKindEnum,
  discogReleaseTypeEnum,
  providerLinkOwnerEnum,
  providers,
  discogReleases,
  discogTracks,
  providerLinks,
  smartLinkTargets,
} from './catalog';

// Analytics domain
export {
  linkTypeEnum,
  audienceMemberTypeEnum,
  audienceDeviceTypeEnum,
  audienceIntentLevelEnum,
  audienceMembers,
  clickEvents,
} from './analytics';

// Billing domain
export {
  currencyCodeEnum,
  tips,
  stripeWebhookEvents,
  billingAuditLog,
} from './billing';

// Notifications domain
export {
  notificationChannelEnum,
  notificationSubscriptions,
} from './notifications';

// Waitlist domain
export {
  waitlistStatusEnum,
  waitlistInviteStatusEnum,
  waitlistEntries,
  waitlistInvites,
} from './waitlist';

// Infrastructure domain
export {
  ingestionJobStatusEnum,
  scraperStrategyEnum,
  dashboardIdempotencyKeys,
  signedLinkAccess,
  wrappedLinks,
  ingestionJobs,
  scraperConfigs,
} from './infrastructure';

// ============================================================================
// Import tables for Zod schema and type generation
// ============================================================================

import { users, userSettings } from './users';
import {
  creatorProfiles,
  creatorContacts,
  socialLinks,
  socialAccounts,
  profilePhotos,
} from './creators';
import {
  providers,
  discogReleases,
  discogTracks,
  providerLinks,
  smartLinkTargets,
} from './catalog';
import { audienceMembers, clickEvents } from './analytics';
import { tips, stripeWebhookEvents, billingAuditLog } from './billing';
import { notificationSubscriptions } from './notifications';
import { waitlistEntries, waitlistInvites } from './waitlist';
import {
  dashboardIdempotencyKeys,
  signedLinkAccess,
  wrappedLinks,
  ingestionJobs,
  scraperConfigs,
} from './infrastructure';

// ============================================================================
// Zod Validation Schemas
// ============================================================================

// Users
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

// Providers
export const insertProviderSchema = createInsertSchema(providers);
export const selectProviderSchema = createSelectSchema(providers);

// Creator Profiles
export const insertCreatorProfileSchema = createInsertSchema(creatorProfiles);
export const selectCreatorProfileSchema = createSelectSchema(creatorProfiles);

// Discog Releases
export const insertDiscogReleaseSchema = createInsertSchema(discogReleases);
export const selectDiscogReleaseSchema = createSelectSchema(discogReleases);

// Discog Tracks
export const insertDiscogTrackSchema = createInsertSchema(discogTracks);
export const selectDiscogTrackSchema = createSelectSchema(discogTracks);

// Provider Links
export const insertProviderLinkSchema = createInsertSchema(providerLinks);
export const selectProviderLinkSchema = createSelectSchema(providerLinks);

// Smart Link Targets
export const insertSmartLinkTargetSchema = createInsertSchema(smartLinkTargets);
export const selectSmartLinkTargetSchema = createSelectSchema(smartLinkTargets);

// Social Links
export const insertSocialLinkSchema = createInsertSchema(socialLinks);
export const selectSocialLinkSchema = createSelectSchema(socialLinks);

// Creator Contacts
export const insertCreatorContactSchema = createInsertSchema(creatorContacts);
export const selectCreatorContactSchema = createSelectSchema(creatorContacts);

// Click Events
export const insertClickEventSchema = createInsertSchema(clickEvents);
export const selectClickEventSchema = createSelectSchema(clickEvents);

// Notification Subscriptions
export const insertNotificationSubscriptionSchema = createInsertSchema(
  notificationSubscriptions
);
export const selectNotificationSubscriptionSchema = createSelectSchema(
  notificationSubscriptions
);

// Tips
export const insertTipSchema = createInsertSchema(tips);
export const selectTipSchema = createSelectSchema(tips);

// Signed Link Access
export const insertSignedLinkAccessSchema =
  createInsertSchema(signedLinkAccess);
export const selectSignedLinkAccessSchema =
  createSelectSchema(signedLinkAccess);

// Wrapped Links
export const insertWrappedLinkSchema = createInsertSchema(wrappedLinks);
export const selectWrappedLinkSchema = createSelectSchema(wrappedLinks);

// Stripe Webhook Events
export const insertStripeWebhookEventSchema =
  createInsertSchema(stripeWebhookEvents);
export const selectStripeWebhookEventSchema =
  createSelectSchema(stripeWebhookEvents);

// Profile Photos
export const insertProfilePhotoSchema = createInsertSchema(profilePhotos);
export const selectProfilePhotoSchema = createSelectSchema(profilePhotos);

// Social Accounts
export const insertSocialAccountSchema = createInsertSchema(socialAccounts);
export const selectSocialAccountSchema = createSelectSchema(socialAccounts);

// Ingestion Jobs
export const insertIngestionJobSchema = createInsertSchema(ingestionJobs);
export const selectIngestionJobSchema = createSelectSchema(ingestionJobs);

// Scraper Configs
export const insertScraperConfigSchema = createInsertSchema(scraperConfigs);
export const selectScraperConfigSchema = createSelectSchema(scraperConfigs);

// Waitlist Entries
export const insertWaitlistEntrySchema = createInsertSchema(waitlistEntries);
export const selectWaitlistEntrySchema = createSelectSchema(waitlistEntries);

// Waitlist Invites
export const insertWaitlistInviteSchema = createInsertSchema(waitlistInvites);
export const selectWaitlistInviteSchema = createSelectSchema(waitlistInvites);

// Billing Audit Log
export const insertBillingAuditLogSchema = createInsertSchema(billingAuditLog);
export const selectBillingAuditLogSchema = createSelectSchema(billingAuditLog);

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
