import { pgEnum } from 'drizzle-orm/pg-core';

// Creator & Profile Enums
export const creatorTypeEnum = pgEnum('creator_type', [
  'artist',
  'podcaster',
  'influencer',
  'creator',
]);

export const themeModeEnum = pgEnum('theme_mode', ['system', 'light', 'dark']);

export const photoStatusEnum = pgEnum('photo_status', [
  'uploading',
  'processing',
  'ready',
  'failed',
]);

// Link & Social Enums
export const linkTypeEnum = pgEnum('link_type', [
  'listen',
  'social',
  'tip',
  'other',
]);

export const socialLinkStateEnum = pgEnum('social_link_state', [
  'active',
  'suggested',
  'rejected',
]);

export const socialAccountStatusEnum = pgEnum('social_account_status', [
  'suspected',
  'confirmed',
  'rejected',
]);

// Provider & Content Enums
export const providerKindEnum = pgEnum('provider_kind', [
  'music_streaming',
  'video',
  'social',
  'retail',
  'other',
]);

export const discogReleaseTypeEnum = pgEnum('discog_release_type', [
  'single',
  'ep',
  'album',
  'compilation',
  'live',
  'mixtape',
  'other',
]);

export const providerLinkOwnerEnum = pgEnum('provider_link_owner_type', [
  'release',
  'track',
]);

// Billing & Subscription Enums
export const subscriptionPlanEnum = pgEnum('subscription_plan', [
  'free',
  'basic',
  'premium',
  'pro',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'inactive',
  'cancelled',
  'past_due',
  'trialing',
  'incomplete',
  'incomplete_expired',
  'unpaid',
]);

export const currencyCodeEnum = pgEnum('currency_code', [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'JPY',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
]);

// Ingestion Enums
export const ingestionStatusEnum = pgEnum('ingestion_status', [
  'idle',
  'pending',
  'processing',
  'failed',
]);

export const ingestionSourceTypeEnum = pgEnum('ingestion_source_type', [
  'manual',
  'admin',
  'ingested',
]);

export const ingestionJobStatusEnum = pgEnum('ingestion_job_status', [
  'pending',
  'processing',
  'succeeded',
  'failed',
]);

export const scraperStrategyEnum = pgEnum('scraper_strategy', [
  'http',
  'browser',
  'api',
]);

// Contact Enums
export const contactRoleEnum = pgEnum('contact_role', [
  'bookings',
  'management',
  'press_pr',
  'brand_partnerships',
  'fan_general',
  'other',
]);

export const contactChannelEnum = pgEnum('contact_channel', ['email', 'phone']);

// Waitlist Enums
export const waitlistStatusEnum = pgEnum('waitlist_status', [
  'new',
  'invited',
  'claimed',
]);

export const waitlistInviteStatusEnum = pgEnum('waitlist_invite_status', [
  'pending',
  'sending',
  'sent',
  'failed',
]);

// User status lifecycle enum - single source of truth for user state
export const userStatusLifecycleEnum = pgEnum('user_status_lifecycle', [
  'waitlist_pending',
  'waitlist_approved',
  'profile_claimed',
  'onboarding_incomplete',
  'active',
  'suspended',
  'banned',
]);

// Creator Claim Invite Enums
export const claimInviteStatusEnum = pgEnum('claim_invite_status', [
  'pending',
  'scheduled',
  'sending',
  'sent',
  'bounced',
  'failed',
  'unsubscribed',
]);

// DSP Enrichment Enums
export const dspMatchStatusEnum = pgEnum('dsp_match_status', [
  'suggested',
  'confirmed',
  'rejected',
  'auto_confirmed',
]);

export const releaseNotificationTypeEnum = pgEnum('release_notification_type', [
  'preview',
  'release_day',
]);

export const releaseNotificationStatusEnum = pgEnum(
  'release_notification_status',
  ['pending', 'scheduled', 'sending', 'sent', 'failed', 'cancelled']
);

export const socialSuggestionStatusEnum = pgEnum('social_suggestion_status', [
  'pending',
  'accepted',
  'rejected',
  'email_sent',
  'expired',
]);

// Audience & Analytics Enums
export const notificationChannelEnum = pgEnum('notification_channel', [
  'email',
  'sms',
  'push',
]);

export const audienceMemberTypeEnum = pgEnum('audience_member_type', [
  'anonymous',
  'email',
  'sms',
  'spotify',
  'customer',
]);

export const audienceDeviceTypeEnum = pgEnum('audience_device_type', [
  'mobile',
  'desktop',
  'tablet',
  'unknown',
]);

export const audienceIntentLevelEnum = pgEnum('audience_intent_level', [
  'high',
  'medium',
  'low',
]);

// Email Suppression Enums
export const suppressionReasonEnum = pgEnum('suppression_reason', [
  'hard_bounce',
  'soft_bounce',
  'spam_complaint',
  'invalid_address',
  'user_request',
  'abuse',
  'legal',
]);

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'pending',
  'sent',
  'delivered',
  'bounced',
  'complained',
  'failed',
  'suppressed',
]);

// Multi-Artist Support Enums (DDEX/MusicBrainz aligned)
export const artistTypeEnum = pgEnum('artist_type', [
  'person',
  'group',
  'orchestra',
  'choir',
  'character',
  'other',
]);

export const artistRoleEnum = pgEnum('artist_role', [
  'main_artist',
  'featured_artist',
  'remixer',
  'producer',
  'co_producer',
  'composer',
  'lyricist',
  'arranger',
  'conductor',
  'vs',
  'with',
  'other',
]);

// Content Slug Enums
export const contentSlugTypeEnum = pgEnum('content_slug_type', [
  'release',
  'track',
]);

// Contracts & Agreements Enums
export const agreementTypeEnum = pgEnum('agreement_type', [
  'split_sheet', // Master + publishing ownership
  'producer_agreement', // Beat/production deal
  'session_agreement', // Work-for-hire
  'licensing_agreement', // Sync, sample, remix
  'collaboration_agreement', // General collab terms
]);

export const agreementStatusEnum = pgEnum('agreement_status', [
  'draft', // Being edited
  'pending', // Sent, awaiting signatures
  'active', // All parties signed
  'expired', // Past validity date
  'terminated', // Cancelled by party
  'disputed', // Under dispute
]);

export const splitTypeEnum = pgEnum('split_type', [
  'master', // Sound recording ownership
  'publishing', // Composition/songwriting
  'sync', // Sync licensing share
  'performance', // Performance royalties
]);

export const signatureStatusEnum = pgEnum('signature_status', [
  'pending',
  'signed',
  'declined',
  'expired',
]);
