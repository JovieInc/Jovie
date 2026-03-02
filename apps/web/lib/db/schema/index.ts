/**
 * Database Schema - Explicit Named Re-exports
 *
 * This file re-exports all schema definitions from domain-focused modules
 * using explicit named exports for deterministic tree-shaking.
 */

// Admin
export {
  type AdminAuditLog,
  adminAuditLog,
  insertAdminAuditLogSchema,
  type NewAdminAuditLog,
  selectAdminAuditLogSchema,
} from './admin';

// Analytics (Clicks, Audience, Tips)
export {
  type AudienceMember,
  audienceMembers,
  type ClickEvent,
  clickEvents,
  FAN_NOTIFICATION_CONTENT_TYPES,
  type FanNotificationContentType,
  type FanNotificationPreferences,
  insertClickEventSchema,
  insertNotificationSubscriptionSchema,
  insertTipSchema,
  type NewAudienceMember,
  type NewClickEvent,
  type NewNotificationSubscription,
  type NewTip,
  type NotificationSubscription,
  notificationSubscriptions,
  selectClickEventSchema,
  selectNotificationSubscriptionSchema,
  selectTipSchema,
  type Tip,
  tips,
} from './analytics';

// Audit (Ingest Audit Logs)
export {
  type IngestAuditLog,
  ingestAuditLogs,
  insertIngestAuditLogSchema,
  type NewIngestAuditLog,
  selectIngestAuditLogSchema,
} from './audit';

// Auth & Users
export {
  insertUserSchema,
  type NewUser,
  type NewUserSettings,
  selectUserSchema,
  type User,
  type UserSettings,
  userSettings,
  users,
} from './auth';

// Billing (Stripe, Audit)
export {
  type BillingAuditLog,
  billingAuditLog,
  insertBillingAuditLogSchema,
  insertStripeWebhookEventSchema,
  type NewBillingAuditLog,
  type NewStripeWebhookEvent,
  type StripeWebhookEvent,
  selectBillingAuditLogSchema,
  selectStripeWebhookEventSchema,
  stripeWebhookEvents,
} from './billing';

// Chat (Conversations, Messages, Audit)
export {
  type ChatAuditLog,
  type ChatConversation,
  type ChatMessage,
  chatAuditLog,
  chatConversations,
  chatMessages,
  insertChatAuditLogSchema,
  insertChatConversationSchema,
  insertChatMessageSchema,
  type NewChatAuditLog,
  type NewChatConversation,
  type NewChatMessage,
  selectChatAuditLogSchema,
  selectChatConversationSchema,
  selectChatMessageSchema,
} from './chat';

// Content (Providers, Releases, Tracks)
export {
  type Artist,
  type ArtistRole,
  type ArtistType,
  artists,
  type ContentSlugRedirect,
  contentSlugRedirects,
  type DiscogRelease,
  type DiscogTrack,
  discogReleases,
  discogTracks,
  insertArtistSchema,
  insertContentSlugRedirectSchema,
  insertDiscogReleaseSchema,
  insertDiscogTrackSchema,
  insertProviderLinkSchema,
  insertProviderSchema,
  insertReleaseArtistSchema,
  insertSmartLinkTargetSchema,
  insertTrackArtistSchema,
  type NewArtist,
  type NewContentSlugRedirect,
  type NewDiscogRelease,
  type NewDiscogTrack,
  type NewProvider,
  type NewProviderLink,
  type NewReleaseArtist,
  type NewSmartLinkTarget,
  type NewTrackArtist,
  type Provider,
  type ProviderLink,
  providerLinks,
  providers,
  type ReleaseArtist,
  releaseArtists,
  type SmartLinkTarget,
  selectArtistSchema,
  selectContentSlugRedirectSchema,
  selectDiscogReleaseSchema,
  selectDiscogTrackSchema,
  selectProviderLinkSchema,
  selectProviderSchema,
  selectReleaseArtistSchema,
  selectSmartLinkTargetSchema,
  selectTrackArtistSchema,
  smartLinkTargets,
  type TrackArtist,
  trackArtists,
} from './content';

// DSP Bio Sync (Bio update pushes to DSPs)
export {
  type DspBioSyncMetadata,
  type DspBioSyncRequest,
  dspBioSyncRequests,
  insertDspBioSyncRequestSchema,
  type NewDspBioSyncRequest,
  selectDspBioSyncRequestSchema,
} from './dsp-bio-sync';

// DSP Enrichment (Cross-platform matches, enrichment data)
export {
  type DspArtistEnrichment,
  type DspArtistMatch,
  type DspExternalUrls,
  type DspImageUrls,
  type DspMatchConfidenceBreakdown,
  dspArtistEnrichment,
  dspArtistMatches,
  type FanReleaseNotification,
  fanReleaseNotifications,
  insertDspArtistEnrichmentSchema,
  insertDspArtistMatchSchema,
  insertFanReleaseNotificationSchema,
  insertReleaseSyncStatusSchema,
  insertSocialLinkSuggestionSchema,
  type NewDspArtistEnrichment,
  type NewDspArtistMatch,
  type NewFanReleaseNotification,
  type NewReleaseSyncStatus,
  type NewSocialLinkSuggestion,
  type ReleaseSyncStatus,
  releaseSyncStatus,
  type SocialLinkSuggestion,
  type SocialSuggestionConfidenceBreakdown,
  selectDspArtistEnrichmentSchema,
  selectDspArtistMatchSchema,
  selectFanReleaseNotificationSchema,
  selectReleaseSyncStatusSchema,
  selectSocialLinkSuggestionSchema,
  socialLinkSuggestions,
} from './dsp-enrichment';

// Email Engagement (Opens, Clicks, Drip Campaigns)
export {
  type CampaignEnrollment,
  type CampaignSequence,
  type CampaignStep,
  type CampaignStepCondition,
  campaignEnrollments,
  campaignSequences,
  type EmailEngagement,
  type EmailEngagementEventType,
  type EmailEngagementMetadata,
  emailEngagement,
  insertCampaignEnrollmentSchema,
  insertCampaignSequenceSchema,
  insertEmailEngagementSchema,
  type NewCampaignEnrollment,
  type NewCampaignSequence,
  type NewEmailEngagement,
  selectCampaignEnrollmentSchema,
  selectCampaignSequenceSchema,
  selectEmailEngagementSchema,
  type TrackedEmailType,
} from './email-engagement';

// Enums
export {
  artistRoleEnum,
  artistTypeEnum,
  audienceDeviceTypeEnum,
  audienceIntentLevelEnum,
  audienceMemberTypeEnum,
  chatMessageRoleEnum,
  claimInviteStatusEnum,
  contactChannelEnum,
  contactRoleEnum,
  contentSlugTypeEnum,
  creatorTypeEnum,
  currencyCodeEnum,
  deliveryStatusEnum,
  discogReleaseTypeEnum,
  dspBioSyncMethodEnum,
  dspBioSyncStatusEnum,
  dspMatchStatusEnum,
  ingestionJobStatusEnum,
  ingestionSourceTypeEnum,
  ingestionStatusEnum,
  insightCategoryEnum,
  insightPriorityEnum,
  insightRunStatusEnum,
  insightStatusEnum,
  insightTypeEnum,
  linkTypeEnum,
  notificationChannelEnum,
  outreachChannelEnum,
  outreachStatusEnum,
  photoStatusEnum,
  pixelEventTypeEnum,
  pixelForwardStatusEnum,
  providerKindEnum,
  providerLinkOwnerEnum,
  referralCommissionStatusEnum,
  referralStatusEnum,
  releaseNotificationStatusEnum,
  releaseNotificationTypeEnum,
  scraperStrategyEnum,
  senderStatusEnum,
  socialAccountStatusEnum,
  socialLinkStateEnum,
  socialSuggestionStatusEnum,
  subscriptionPlanEnum,
  subscriptionStatusEnum,
  suppressionReasonEnum,
  themeModeEnum,
  tipStatusEnum,
  userStatusLifecycleEnum,
  waitlistInviteStatusEnum,
  waitlistStatusEnum,
} from './enums';

// Feedback
export {
  type FeedbackItem,
  feedbackItems,
  feedbackStatusEnumValues,
  insertFeedbackItemSchema,
  type NewFeedbackItem,
  selectFeedbackItemSchema,
} from './feedback';

// Ingestion
export {
  type IngestionJob,
  ingestionJobs,
  insertIngestionJobSchema,
  insertScraperConfigSchema,
  type NewIngestionJob,
  type NewScraperConfig,
  type ScraperConfig,
  scraperConfigs,
  selectIngestionJobSchema,
  selectScraperConfigSchema,
} from './ingestion';

// AI Insights (AI-generated analytics insights)
export {
  aiInsights,
  insertAiInsightSchema,
  insertInsightGenerationRunSchema,
  insightGenerationRuns,
  selectAiInsightSchema,
  selectInsightGenerationRunSchema,
} from './insights';

// Links (Social, Wrapped, Signed)
export {
  type DashboardIdempotencyKey,
  dashboardIdempotencyKeys,
  insertSignedLinkAccessSchema,
  insertSocialAccountSchema,
  insertSocialLinkSchema,
  insertWrappedLinkSchema,
  type NewDashboardIdempotencyKey,
  type NewSignedLinkAccess,
  type NewSocialAccount,
  type NewSocialLink,
  type NewWrappedLink,
  type SignedLinkAccess,
  type SocialAccount,
  type SocialLink,
  selectSignedLinkAccessSchema,
  selectSocialAccountSchema,
  selectSocialLinkSchema,
  selectWrappedLinkSchema,
  signedLinkAccess,
  socialAccounts,
  socialLinks,
  type WrappedLink,
  wrappedLinks,
} from './links';

// Pixel Tracking (Events, Creator Configs)
export {
  type CreatorPixel,
  creatorPixels,
  insertCreatorPixelSchema,
  insertPixelEventSchema,
  type NewCreatorPixel,
  type NewPixelEvent,
  type PixelEvent,
  type PixelEventData,
  type PixelForwardingStatus,
  pixelEvents,
  selectCreatorPixelSchema,
  selectPixelEventSchema,
} from './pixels';

// Pre-save campaigns (Spotify, Apple Music)
export {
  type NewPreSaveToken,
  type PreSaveToken,
  preSaveTokens,
} from './pre-save';

// Creator Profiles
export {
  type CreatorAvatarCandidate,
  type CreatorClaimInvite,
  type CreatorContact,
  type CreatorProfile,
  type CreatorProfileAttribute,
  creatorAvatarCandidates,
  creatorClaimInvites,
  creatorContacts,
  creatorProfileAttributes,
  creatorProfiles,
  type FitScoreBreakdown,
  insertCreatorAvatarCandidateSchema,
  insertCreatorClaimInviteSchema,
  insertCreatorContactSchema,
  insertCreatorProfileAttributeSchema,
  insertCreatorProfileSchema,
  insertProfilePhotoSchema,
  type NewCreatorAvatarCandidate,
  type NewCreatorClaimInvite,
  type NewCreatorContact,
  type NewCreatorProfile,
  type NewCreatorProfileAttribute,
  type NewProfilePhoto,
  type NotificationPreferences,
  type ProfilePhoto,
  profilePhotos,
  selectCreatorAvatarCandidateSchema,
  selectCreatorClaimInviteSchema,
  selectCreatorContactSchema,
  selectCreatorProfileAttributeSchema,
  selectCreatorProfileSchema,
  selectProfilePhotoSchema,
} from './profiles';

// Referral Program (Codes, Referrals, Commissions)
export {
  insertReferralCodeSchema,
  insertReferralCommissionSchema,
  insertReferralSchema,
  type NewReferral,
  type NewReferralCode,
  type NewReferralCommission,
  type Referral,
  type ReferralCode,
  type ReferralCommission,
  referralCodes,
  referralCommissions,
  referrals,
  selectReferralCodeSchema,
  selectReferralCommissionSchema,
  selectReferralSchema,
} from './referrals';

// Sender (Email Quotas, Sending Reputation, Send Attribution)
export {
  type CreatorEmailQuota,
  type CreatorSendingReputation,
  creatorEmailQuotas,
  creatorSendingReputation,
  type EmailSendAttribution,
  emailSendAttribution,
  insertCreatorEmailQuotaSchema,
  insertCreatorSendingReputationSchema,
  insertEmailSendAttributionSchema,
  type NewCreatorEmailQuota,
  type NewCreatorSendingReputation,
  type NewEmailSendAttribution,
  type QuotaMetadata,
  type ReputationMetadata,
  selectCreatorEmailQuotaSchema,
  selectCreatorSendingReputationSchema,
  selectEmailSendAttributionSchema,
} from './sender';

// Suppression (Email Suppressions, Webhook Events, Delivery Logs)
export {
  type CategorySubscription,
  categorySubscriptions,
  type DeliveryLogMetadata,
  type EmailSuppression,
  emailSuppressions,
  insertCategorySubscriptionSchema,
  insertEmailSuppressionSchema,
  insertNotificationDeliveryLogSchema,
  insertUnsubscribeTokenSchema,
  insertWebhookEventSchema,
  type NewCategorySubscription,
  type NewEmailSuppression,
  type NewNotificationDeliveryLog,
  type NewUnsubscribeToken,
  type NewWebhookEvent,
  type NotificationDeliveryLog,
  notificationDeliveryLog,
  type SuppressionMetadata,
  selectCategorySubscriptionSchema,
  selectEmailSuppressionSchema,
  selectNotificationDeliveryLogSchema,
  selectUnsubscribeTokenSchema,
  selectWebhookEventSchema,
  type UnsubscribeToken,
  unsubscribeTokens,
  type WebhookEvent,
  webhookEvents,
} from './suppression';

// Tour (Tour Dates)
export {
  insertTourDateSchema,
  type NewTourDate,
  selectTourDateSchema,
  type TourDate,
  ticketStatusEnum,
  tourDateProviderEnum,
  tourDates,
} from './tour';

// Waitlist
export {
  insertWaitlistEntrySchema,
  insertWaitlistInviteSchema,
  insertWaitlistSettingsSchema,
  type NewWaitlistEntry,
  type NewWaitlistInvite,
  selectWaitlistEntrySchema,
  selectWaitlistInviteSchema,
  selectWaitlistSettingsSchema,
  type WaitlistEntry,
  type WaitlistInvite,
  type WaitlistSettings,
  waitlistEntries,
  waitlistInvites,
  waitlistSettings,
} from './waitlist';
