/**
 * Database Schema - Zod Validation Schemas
 *
 * Centralized validation schemas generated from Drizzle table definitions
 * using drizzle-zod. These schemas provide runtime validation for:
 *
 * - Insert operations (insertXSchema): Validates data before database inserts
 * - Select operations (selectXSchema): Validates data returned from queries
 *
 * Usage:
 *   import { insertUserSchema, selectCreatorProfileSchema } from '@/lib/db/schema';
 *   const validatedUser = insertUserSchema.parse(userData);
 */

import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

// Import tables from domain modules
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
// Users Domain Schemas
// ============================================================================

/** Validates user data before insert */
export const insertUserSchema = createInsertSchema(users);
/** Validates user data from database select */
export const selectUserSchema = createSelectSchema(users);

/** Validates user settings data before insert */
export const insertUserSettingsSchema = createInsertSchema(userSettings);
/** Validates user settings data from database select */
export const selectUserSettingsSchema = createSelectSchema(userSettings);

// ============================================================================
// Creators Domain Schemas
// ============================================================================

/** Validates creator profile data before insert */
export const insertCreatorProfileSchema = createInsertSchema(creatorProfiles);
/** Validates creator profile data from database select */
export const selectCreatorProfileSchema = createSelectSchema(creatorProfiles);

/** Validates creator contact data before insert */
export const insertCreatorContactSchema = createInsertSchema(creatorContacts);
/** Validates creator contact data from database select */
export const selectCreatorContactSchema = createSelectSchema(creatorContacts);

/** Validates social link data before insert */
export const insertSocialLinkSchema = createInsertSchema(socialLinks);
/** Validates social link data from database select */
export const selectSocialLinkSchema = createSelectSchema(socialLinks);

/** Validates social account data before insert */
export const insertSocialAccountSchema = createInsertSchema(socialAccounts);
/** Validates social account data from database select */
export const selectSocialAccountSchema = createSelectSchema(socialAccounts);

/** Validates profile photo data before insert */
export const insertProfilePhotoSchema = createInsertSchema(profilePhotos);
/** Validates profile photo data from database select */
export const selectProfilePhotoSchema = createSelectSchema(profilePhotos);

// ============================================================================
// Catalog Domain Schemas
// ============================================================================

/** Validates provider data before insert */
export const insertProviderSchema = createInsertSchema(providers);
/** Validates provider data from database select */
export const selectProviderSchema = createSelectSchema(providers);

/** Validates discog release data before insert */
export const insertDiscogReleaseSchema = createInsertSchema(discogReleases);
/** Validates discog release data from database select */
export const selectDiscogReleaseSchema = createSelectSchema(discogReleases);

/** Validates discog track data before insert */
export const insertDiscogTrackSchema = createInsertSchema(discogTracks);
/** Validates discog track data from database select */
export const selectDiscogTrackSchema = createSelectSchema(discogTracks);

/** Validates provider link data before insert */
export const insertProviderLinkSchema = createInsertSchema(providerLinks);
/** Validates provider link data from database select */
export const selectProviderLinkSchema = createSelectSchema(providerLinks);

/** Validates smart link target data before insert */
export const insertSmartLinkTargetSchema = createInsertSchema(smartLinkTargets);
/** Validates smart link target data from database select */
export const selectSmartLinkTargetSchema = createSelectSchema(smartLinkTargets);

// ============================================================================
// Analytics Domain Schemas
// ============================================================================

/** Validates audience member data before insert */
export const insertAudienceMemberSchema = createInsertSchema(audienceMembers);
/** Validates audience member data from database select */
export const selectAudienceMemberSchema = createSelectSchema(audienceMembers);

/** Validates click event data before insert */
export const insertClickEventSchema = createInsertSchema(clickEvents);
/** Validates click event data from database select */
export const selectClickEventSchema = createSelectSchema(clickEvents);

// ============================================================================
// Billing Domain Schemas
// ============================================================================

/** Validates tip data before insert */
export const insertTipSchema = createInsertSchema(tips);
/** Validates tip data from database select */
export const selectTipSchema = createSelectSchema(tips);

/** Validates stripe webhook event data before insert */
export const insertStripeWebhookEventSchema =
  createInsertSchema(stripeWebhookEvents);
/** Validates stripe webhook event data from database select */
export const selectStripeWebhookEventSchema =
  createSelectSchema(stripeWebhookEvents);

/** Validates billing audit log data before insert */
export const insertBillingAuditLogSchema = createInsertSchema(billingAuditLog);
/** Validates billing audit log data from database select */
export const selectBillingAuditLogSchema = createSelectSchema(billingAuditLog);

// ============================================================================
// Notifications Domain Schemas
// ============================================================================

/** Validates notification subscription data before insert */
export const insertNotificationSubscriptionSchema = createInsertSchema(
  notificationSubscriptions
);
/** Validates notification subscription data from database select */
export const selectNotificationSubscriptionSchema = createSelectSchema(
  notificationSubscriptions
);

// ============================================================================
// Waitlist Domain Schemas
// ============================================================================

/** Validates waitlist entry data before insert */
export const insertWaitlistEntrySchema = createInsertSchema(waitlistEntries);
/** Validates waitlist entry data from database select */
export const selectWaitlistEntrySchema = createSelectSchema(waitlistEntries);

/** Validates waitlist invite data before insert */
export const insertWaitlistInviteSchema = createInsertSchema(waitlistInvites);
/** Validates waitlist invite data from database select */
export const selectWaitlistInviteSchema = createSelectSchema(waitlistInvites);

// ============================================================================
// Infrastructure Domain Schemas
// ============================================================================

/** Validates dashboard idempotency key data before insert */
export const insertDashboardIdempotencyKeySchema = createInsertSchema(
  dashboardIdempotencyKeys
);
/** Validates dashboard idempotency key data from database select */
export const selectDashboardIdempotencyKeySchema = createSelectSchema(
  dashboardIdempotencyKeys
);

/** Validates signed link access data before insert */
export const insertSignedLinkAccessSchema =
  createInsertSchema(signedLinkAccess);
/** Validates signed link access data from database select */
export const selectSignedLinkAccessSchema =
  createSelectSchema(signedLinkAccess);

/** Validates wrapped link data before insert */
export const insertWrappedLinkSchema = createInsertSchema(wrappedLinks);
/** Validates wrapped link data from database select */
export const selectWrappedLinkSchema = createSelectSchema(wrappedLinks);

/** Validates ingestion job data before insert */
export const insertIngestionJobSchema = createInsertSchema(ingestionJobs);
/** Validates ingestion job data from database select */
export const selectIngestionJobSchema = createSelectSchema(ingestionJobs);

/** Validates scraper config data before insert */
export const insertScraperConfigSchema = createInsertSchema(scraperConfigs);
/** Validates scraper config data from database select */
export const selectScraperConfigSchema = createSelectSchema(scraperConfigs);
