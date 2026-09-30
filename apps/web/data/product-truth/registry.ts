import {
  ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
  FREE_PROFILE_TRUTH,
  MAX_EARLY_ACCESS_TRUTH,
  PRO_TRIAL_DURATION_DAYS,
  PRO_TRIAL_TRUTH,
} from '@/lib/billing/offer-truth';
import type {
  BooleanEntitlement,
  NumericEntitlement,
} from '@/lib/entitlements/registry';
import type { AppFlagName } from '@/lib/flags/contracts';

/**
 * Product-truth registry — canonical capability + claims model (JOV-7247,
 * specified by JOV-6223).
 *
 * A `Capability` is the product-truth record for one thing the product can
 * do. It owns maturity, publication, and access decisions plus the
 * entitlement keys, feature flag, and evidence that bind it to the codebase.
 * Marketing route projections live in
 * `@/data/marketing/featureAvailability` and must stay a projection of this
 * registry — never a competing source of truth.
 *
 * A `Claim` is one public statement about a capability. Every claim names
 * the file it is asserted from (`source`) so truth-sync can hash it and a
 * test can prove the words actually exist where we say they do.
 */

export const FEATURE_MATURITY_STATES = [
  'proposed',
  'limited_testing',
  'public_beta',
  'general_availability',
] as const;
export type FeatureMaturity = (typeof FEATURE_MATURITY_STATES)[number];

/** Explicit general-versus-ICP audience scope for a capability. */
export const FEATURE_AUDIENCE_SCOPES = ['general', 'icp'] as const;
export type FeatureAudienceScope = (typeof FEATURE_AUDIENCE_SCOPES)[number];

/** Permission to announce a feature — separate from permission to use it. */
export const PUBLICATION_PERMISSIONS = [
  'internal_only',
  'unlisted',
  'public',
] as const;
export type PublicationPermission = (typeof PUBLICATION_PERMISSIONS)[number];

/** Permission to use a feature — separate from permission to announce it. */
export const FEATURE_ACCESS_STATES = [
  'unavailable',
  'interest_capture',
  'enrolled',
  'open',
] as const;
export type FeatureAccessState = (typeof FEATURE_ACCESS_STATES)[number];

/** Evidence backing a capability record. */
export interface CapabilityEvidence {
  /** Named capture/QA scenarios that demonstrate the capability. */
  readonly captureScenarios: readonly string[];
  /** Routes where the capability is publicly exercised. */
  readonly routes: readonly string[];
}

/**
 * Product-truth record for one capability. The first fields mirror the
 * marketing `FeatureCapabilityRecord` projection; the registry adds the
 * entitlement, flag, and evidence bindings.
 */
export interface Capability {
  readonly id: string;
  /** Product maturity — never inferred from route existence or a role label. */
  readonly maturity: FeatureMaturity;
  /** Permission to announce/publish. */
  readonly publication: PublicationPermission;
  /** Permission to use. */
  readonly access: FeatureAccessState;
  /** Explicit audience scope: 'general' pages must not require music fields. */
  readonly audience: FeatureAudienceScope;
  /**
   * Canonical offer reference. Reuse `ARTIST_VISIBILITY_OFFER_CONTRACT_ID`.
   * Absent = not for sale.
   */
  readonly offerId?: string;
  /** Supported jobs this capability delivers. */
  readonly supportedJobs: readonly string[];
  /** Whether the attached proof has publication authorization. */
  readonly proofAuthorized: boolean;
  /** Real content revision (ISO date) — drives derived lastmod outputs. */
  readonly contentRevision: string;
  /**
   * Public access label for non-GA published pages. Required when the page
   * is published while access is not 'open'.
   */
  readonly accessLabel?: string;
  /** Entitlement registry keys this capability governs. */
  readonly entitlementKeys: readonly (
    | BooleanEntitlement
    | NumericEntitlement
  )[];
  /** Primary gating flag in `lib/flags`, if the capability is flag-gated. */
  readonly flagKey?: AppFlagName;
  /** Evidence backing the record. */
  readonly evidence: CapabilityEvidence;
}

export const CLAIM_KINDS = [
  'capability',
  'offer',
  'metric',
  'comparison',
] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

/**
 * One public statement about a capability. `source` is a repo-relative path
 * to the file the statement is asserted from; `citation` is an optional
 * substring/anchor in that file. A claim resolves when its source file
 * contains the statement (or citation) text.
 */
export interface Claim {
  readonly id: string;
  readonly capabilityId: CapabilityId;
  readonly statement: string;
  readonly kind: ClaimKind;
  /** Repo-relative path to the file the claim is asserted from. Required. */
  readonly source: string;
  /** Optional anchor text inside `source` (e.g. an exported constant name). */
  readonly citation?: string;
  /** ISO date after which the claim must be re-verified. */
  readonly validUntil?: string;
}

const NO_EVIDENCE: CapabilityEvidence = {
  captureScenarios: [],
  routes: [],
} as const;

/**
 * Canonical capability registry. Marketing capabilities keep the values that
 * previously lived in `MARKETING_FEATURE_CAPABILITIES` (moved verbatim);
 * internal capabilities exist so every entitlement and flag has a product
 * home even when no public page claims it.
 */
export const PRODUCT_TRUTH_CAPABILITIES = {
  // --- Marketing capabilities (routes bound in featureAvailability) ---
  'jovie-card': {
    id: 'jovie-card',
    maturity: 'proposed',
    publication: 'public',
    access: 'interest_capture',
    audience: 'general',
    supportedJobs: ['in-person profile sharing', 'card interest capture'],
    proofAuthorized: true,
    contentRevision: '2026-09-19',
    accessLabel:
      'Jovie Card is planned, not available yet — join the list to register interest.',
    entitlementKeys: [],
    flagKey: 'APPLE_WALLET_PROFILE_PASS',
    evidence: { captureScenarios: [], routes: ['/card'] },
  },
  voice: {
    id: 'voice',
    maturity: 'limited_testing',
    publication: 'unlisted',
    access: 'enrolled',
    audience: 'general',
    supportedJobs: ['voice-assisted profile actions'],
    proofAuthorized: true,
    contentRevision: '2026-07-11',
    accessLabel: 'Voice is in limited testing and is not open to everyone.',
    entitlementKeys: [],
    evidence: { captureScenarios: [], routes: ['/voice'] },
  },
  'smart-links': {
    id: 'smart-links',
    maturity: 'general_availability',
    publication: 'public',
    access: 'open',
    audience: 'icp',
    offerId: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
    supportedJobs: ['release smart links', 'remembered fan platform choice'],
    proofAuthorized: true,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canEditSmartLinks', 'smartLinksLimit'],
    evidence: { captureScenarios: [], routes: ['/smart-links'] },
  },
  'artist-profiles': {
    id: 'artist-profiles',
    maturity: 'general_availability',
    publication: 'public',
    access: 'open',
    audience: 'icp',
    offerId: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
    supportedJobs: [
      'public artist profile',
      'audience capture',
      'fan reactivation',
    ],
    proofAuthorized: true,
    contentRevision: '2026-08-01',
    entitlementKeys: [],
    evidence: { captureScenarios: [], routes: ['/artist-profiles'] },
  },
  'artist-notifications': {
    id: 'artist-notifications',
    maturity: 'general_availability',
    publication: 'public',
    access: 'enrolled',
    audience: 'icp',
    offerId: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
    supportedJobs: ['opt-in fan notifications', 'audience reactivation'],
    proofAuthorized: true,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canSendNotifications'],
    evidence: { captureScenarios: [], routes: ['/artist-notifications'] },
  },
  'instant-merch': {
    id: 'instant-merch',
    maturity: 'limited_testing',
    publication: 'public',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['merch concept generation'],
    proofAuthorized: true,
    contentRevision: '2026-08-01',
    accessLabel:
      'Instant Merch is in limited testing inside the authenticated workspace.',
    entitlementKeys: ['canAccessMerchCreation'],
    flagKey: 'MERCH_MVP',
    evidence: { captureScenarios: [], routes: ['/instant-merch'] },
  },
  'youtube-thumbnails': {
    id: 'youtube-thumbnails',
    maturity: 'public_beta',
    publication: 'public',
    access: 'open',
    audience: 'icp',
    supportedJobs: ['youtube thumbnail preview', 'channel packaging'],
    proofAuthorized: true,
    contentRevision: '2026-08-01',
    entitlementKeys: [],
    evidence: { captureScenarios: [], routes: ['/youtube-thumbnails'] },
  },
  pay: {
    id: 'pay',
    maturity: 'public_beta',
    publication: 'public',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['artist payment surface'],
    proofAuthorized: true,
    contentRevision: '2026-08-01',
    accessLabel: 'Jovie Pay is in public beta for enrolled artists.',
    entitlementKeys: ['canAccessTipping'],
    evidence: { captureScenarios: [], routes: ['/pay'] },
  },
  'release-launch': {
    id: 'release-launch',
    maturity: 'general_availability',
    publication: 'public',
    access: 'enrolled',
    audience: 'icp',
    offerId: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
    supportedJobs: ['release launch planning'],
    proofAuthorized: true,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canGenerateReleasePlans'],
    flagKey: 'RELEASE_PLAN_DEMO',
    evidence: { captureScenarios: [], routes: ['/launch', '/new'] },
  },
  cli: {
    id: 'cli',
    maturity: 'general_availability',
    publication: 'public',
    access: 'open',
    audience: 'icp',
    supportedJobs: ['read-only public artist data from the command line'],
    proofAuthorized: true,
    contentRevision: '2026-08-01',
    entitlementKeys: [],
    flagKey: 'AGENT_PROFILE_CREATE',
    evidence: { captureScenarios: [], routes: ['/cli'] },
  },
  'public-profile': {
    id: 'public-profile',
    maturity: 'general_availability',
    publication: 'public',
    access: 'open',
    audience: 'general',
    offerId: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
    supportedJobs: ['claimable public profile page'],
    proofAuthorized: true,
    contentRevision: '2026-09-17',
    entitlementKeys: [],
    evidence: { captureScenarios: [], routes: ['/product'] },
  },
  'app-download': {
    id: 'app-download',
    maturity: 'general_availability',
    publication: 'public',
    access: 'open',
    audience: 'general',
    supportedJobs: ['install the Jovie app'],
    proofAuthorized: true,
    contentRevision: '2026-08-01',
    entitlementKeys: [],
    evidence: { captureScenarios: [], routes: ['/download'] },
  },
  'selective-reach': {
    id: 'selective-reach',
    maturity: 'proposed',
    publication: 'internal_only',
    access: 'unavailable',
    audience: 'general',
    supportedJobs: [
      'relevance-scoped update delivery',
      'send now, later, or do-not-interrupt decisions',
    ],
    proofAuthorized: false,
    contentRevision: '2026-09-28',
    entitlementKeys: [],
    evidence: NO_EVIDENCE,
  },

  // --- Internal capabilities (no public route binding) ---
  'contacts-crm': {
    id: 'contacts-crm',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'open',
    audience: 'icp',
    supportedJobs: ['audience contact storage and export'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canExportContacts', 'contactsLimit'],
    evidence: NO_EVIDENCE,
  },
  analytics: {
    id: 'analytics',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'open',
    audience: 'icp',
    supportedJobs: ['profile and link analytics'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: [
      'canAccessAdvancedAnalytics',
      'canFilterSelfFromAnalytics',
      'analyticsRetentionDays',
    ],
    evidence: NO_EVIDENCE,
  },
  'ad-pixels': {
    id: 'ad-pixels',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['third-party ad pixel tracking'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canAccessAdPixels'],
    evidence: NO_EVIDENCE,
  },
  'verified-badge': {
    id: 'verified-badge',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['verified profile badge'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canBeVerified'],
    evidence: NO_EVIDENCE,
  },
  'ai-assistant': {
    id: 'ai-assistant',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'open',
    audience: 'icp',
    supportedJobs: ['ai chat assistant with tool use'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: [
      'aiCanUseTools',
      'aiWeeklyMessageLimit',
      'aiPitchGenPerRelease',
    ],
    evidence: NO_EVIDENCE,
  },
  'album-art': {
    id: 'album-art',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['ai-generated release artwork'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canGenerateAlbumArt'],
    flagKey: 'ALBUM_ART_GENERATION',
    evidence: NO_EVIDENCE,
  },
  'manual-releases': {
    id: 'manual-releases',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'open',
    audience: 'icp',
    supportedJobs: ['manual release creation'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canCreateManualReleases'],
    evidence: NO_EVIDENCE,
  },
  'tasks-workspace': {
    id: 'tasks-workspace',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['tasks workspace'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canAccessTasksWorkspace'],
    evidence: NO_EVIDENCE,
  },
  'metadata-agent': {
    id: 'metadata-agent',
    maturity: 'limited_testing',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['metadata submission agent'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canAccessMetadataSubmissionAgent'],
    evidence: NO_EVIDENCE,
  },
  'pre-save': {
    id: 'pre-save',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['pre-save campaigns and future releases'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canAccessPreSave', 'canAccessFutureReleases'],
    flagKey: 'SMARTLINK_PRE_SAVE',
    evidence: NO_EVIDENCE,
  },
  inbox: {
    id: 'inbox',
    maturity: 'limited_testing',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['opportunity inbox'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canAccessInbox'],
    flagKey: 'INBOX_HOME',
    evidence: NO_EVIDENCE,
  },
  'url-encryption': {
    id: 'url-encryption',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['smart link url encryption'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canAccessUrlEncryption'],
    evidence: NO_EVIDENCE,
  },
  'stripe-connect-payouts': {
    id: 'stripe-connect-payouts',
    maturity: 'limited_testing',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['stripe connect payouts'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canAccessStripeConnect'],
    flagKey: 'STRIPE_CONNECT_ENABLED',
    evidence: NO_EVIDENCE,
  },
  'fan-subscriptions': {
    id: 'fan-subscriptions',
    maturity: 'limited_testing',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['fan subscriptions'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canAccessFanSubscriptions'],
    evidence: NO_EVIDENCE,
  },
  'email-campaigns': {
    id: 'email-campaigns',
    maturity: 'limited_testing',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['fan email campaigns'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canAccessEmailCampaigns'],
    evidence: NO_EVIDENCE,
  },
  'api-access': {
    id: 'api-access',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['api key access'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canAccessApiKeys'],
    evidence: NO_EVIDENCE,
  },
  'team-management': {
    id: 'team-management',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['team management'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canAccessTeamManagement'],
    evidence: NO_EVIDENCE,
  },
  webhooks: {
    id: 'webhooks',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['outbound webhooks'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canAccessWebhooks'],
    evidence: NO_EVIDENCE,
  },
  'white-label': {
    id: 'white-label',
    maturity: 'limited_testing',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['white-label profile surfaces'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canAccessWhiteLabel'],
    evidence: NO_EVIDENCE,
  },
  'ab-testing': {
    id: 'ab-testing',
    maturity: 'limited_testing',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['a/b testing'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canAccessAbTesting'],
    evidence: NO_EVIDENCE,
  },
  'ai-retouching': {
    id: 'ai-retouching',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['ai press-photo retouching'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['canAccessAiRetouching', 'aiRetouchDailyLimit'],
    evidence: NO_EVIDENCE,
  },
  'chat-uploads': {
    id: 'chat-uploads',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'open',
    audience: 'icp',
    supportedJobs: ['chat file uploads'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['chatFileUploadLimit'],
    evidence: NO_EVIDENCE,
  },
  'profile-monitoring': {
    id: 'profile-monitoring',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'open',
    audience: 'icp',
    supportedJobs: ['external public-surface monitoring'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: ['profileMonitoringLimit'],
    flagKey: 'PROFILE_SEARCH_MONITORING',
    evidence: NO_EVIDENCE,
  },
  'spotify-oauth': {
    id: 'spotify-oauth',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'open',
    audience: 'general',
    supportedJobs: ['spotify sign-in and sync'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: [],
    flagKey: 'SPOTIFY_OAUTH',
    evidence: NO_EVIDENCE,
  },
  'playlist-engine': {
    id: 'playlist-engine',
    maturity: 'limited_testing',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['playlist engine surfaces'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: [],
    flagKey: 'PLAYLIST_ENGINE',
    evidence: NO_EVIDENCE,
  },
  'chat-instrumentation': {
    id: 'chat-instrumentation',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'open',
    audience: 'general',
    supportedJobs: ['chat reliability instrumentation'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: [],
    flagKey: 'CHAT_JANK_MONITOR',
    evidence: NO_EVIDENCE,
  },
  'release-autopilot': {
    id: 'release-autopilot',
    maturity: 'limited_testing',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['release-to-revenue autopilot pilot'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: [],
    flagKey: 'RELEASE_TO_REVENUE_AUTOPILOT',
    evidence: NO_EVIDENCE,
  },
  'ai-connectors': {
    id: 'ai-connectors',
    maturity: 'public_beta',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['ai connectors beta'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: [],
    flagKey: 'AI_CONNECTORS_BETA',
    evidence: NO_EVIDENCE,
  },
  'press-photo-import': {
    id: 'press-photo-import',
    maturity: 'limited_testing',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['dsp bulk press-photo import'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: [],
    flagKey: 'BULK_PRESS_PHOTO_IMPORT',
    evidence: NO_EVIDENCE,
  },
  teleprompter: {
    id: 'teleprompter',
    maturity: 'limited_testing',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['in-app teleprompter recording'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: [],
    flagKey: 'TELEPROMPTER_RECORDING',
    evidence: NO_EVIDENCE,
  },
  'profiles-workspace': {
    id: 'profiles-workspace',
    maturity: 'limited_testing',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['unified profiles and connections workspace'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: [],
    flagKey: 'PROFILES_WORKSPACE',
    evidence: NO_EVIDENCE,
  },
  onboarding: {
    id: 'onboarding',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'open',
    audience: 'general',
    supportedJobs: ['onboarding presence-build task seeding'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: [],
    flagKey: 'ONBOARDING_WOW_TASK_QUEUE',
    evidence: NO_EVIDENCE,
  },
  'lifecycle-email': {
    id: 'lifecycle-email',
    maturity: 'limited_testing',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['paid-subscription welcome email'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: [],
    flagKey: 'PAID_WELCOME_EMAIL',
    evidence: NO_EVIDENCE,
  },
  'checkout-billing': {
    id: 'checkout-billing',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'open',
    audience: 'general',
    supportedJobs: ['direct billing upgrade checkout'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: [],
    flagKey: 'BILLING_UPGRADE_DIRECT',
    evidence: NO_EVIDENCE,
  },
  'ios-dsp-priority': {
    id: 'ios-dsp-priority',
    maturity: 'general_availability',
    publication: 'internal_only',
    access: 'open',
    audience: 'general',
    supportedJobs: ['apple music priority on ios'],
    proofAuthorized: false,
    contentRevision: '2026-08-01',
    entitlementKeys: [],
    flagKey: 'IOS_APPLE_MUSIC_PRIORITY',
    evidence: NO_EVIDENCE,
  },
  'merch-qa-gate': {
    id: 'merch-qa-gate',
    maturity: 'limited_testing',
    publication: 'internal_only',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['merch pre-publish visual qa gate'],
    proofAuthorized: false,
    contentRevision: '2026-09-01',
    entitlementKeys: [],
    flagKey: 'MERCH_QA_GATE',
    evidence: NO_EVIDENCE,
  },
} as const satisfies Readonly<Record<string, Capability>>;

export type CapabilityId = keyof typeof PRODUCT_TRUTH_CAPABILITIES;

/** Capability ids that carry a public marketing surface. */
export const MARKETING_CAPABILITY_IDS = [
  'jovie-card',
  'voice',
  'smart-links',
  'artist-profiles',
  'artist-notifications',
  'instant-merch',
  'youtube-thumbnails',
  'pay',
  'release-launch',
  'cli',
  'public-profile',
  'app-download',
  'selective-reach',
] as const satisfies readonly CapabilityId[];

export type MarketingCapabilityId = (typeof MARKETING_CAPABILITY_IDS)[number];

/**
 * Every entitlement key (boolean and numeric) maps to exactly one
 * capability. The coverage test derives the key list from
 * `ENTITLEMENT_REGISTRY` so a new entitlement fails here until mapped.
 */
export const ENTITLEMENT_CAPABILITY_MAP = {
  canExportContacts: 'contacts-crm',
  canAccessAdvancedAnalytics: 'analytics',
  canFilterSelfFromAnalytics: 'analytics',
  canAccessAdPixels: 'ad-pixels',
  canBeVerified: 'verified-badge',
  aiCanUseTools: 'ai-assistant',
  canGenerateAlbumArt: 'album-art',
  canCreateManualReleases: 'manual-releases',
  canAccessTasksWorkspace: 'tasks-workspace',
  canGenerateReleasePlans: 'release-launch',
  canAccessMetadataSubmissionAgent: 'metadata-agent',
  canAccessFutureReleases: 'pre-save',
  canSendNotifications: 'artist-notifications',
  canEditSmartLinks: 'smart-links',
  canAccessInbox: 'inbox',
  canAccessPreSave: 'pre-save',
  canAccessTipping: 'pay',
  canAccessUrlEncryption: 'url-encryption',
  canAccessStripeConnect: 'stripe-connect-payouts',
  canAccessFanSubscriptions: 'fan-subscriptions',
  canAccessEmailCampaigns: 'email-campaigns',
  canAccessApiKeys: 'api-access',
  canAccessTeamManagement: 'team-management',
  canAccessWebhooks: 'webhooks',
  canAccessWhiteLabel: 'white-label',
  canAccessAbTesting: 'ab-testing',
  canAccessMerchCreation: 'instant-merch',
  canAccessAiRetouching: 'ai-retouching',
  analyticsRetentionDays: 'analytics',
  contactsLimit: 'contacts-crm',
  smartLinksLimit: 'smart-links',
  aiWeeklyMessageLimit: 'ai-assistant',
  aiPitchGenPerRelease: 'ai-assistant',
  aiRetouchDailyLimit: 'ai-retouching',
  chatFileUploadLimit: 'chat-uploads',
  profileMonitoringLimit: 'profile-monitoring',
} as const satisfies Readonly<
  Record<BooleanEntitlement | NumericEntitlement, CapabilityId>
>;

/** Every app flag maps to the capability it gates. */
export const FLAG_CAPABILITY_MAP = {
  BILLING_UPGRADE_DIRECT: 'checkout-billing',
  SMARTLINK_PRE_SAVE: 'pre-save',
  IOS_APPLE_MUSIC_PRIORITY: 'ios-dsp-priority',
  SPOTIFY_OAUTH: 'spotify-oauth',
  STRIPE_CONNECT_ENABLED: 'stripe-connect-payouts',
  PLAYLIST_ENGINE: 'playlist-engine',
  ALBUM_ART_GENERATION: 'album-art',
  CHAT_JANK_MONITOR: 'chat-instrumentation',
  RELEASE_PLAN_DEMO: 'release-launch',
  RELEASE_TO_REVENUE_AUTOPILOT: 'release-autopilot',
  AI_CONNECTORS_BETA: 'ai-connectors',
  MERCH_MVP: 'instant-merch',
  BULK_PRESS_PHOTO_IMPORT: 'press-photo-import',
  APPLE_WALLET_PROFILE_PASS: 'jovie-card',
  TELEPROMPTER_RECORDING: 'teleprompter',
  INBOX_HOME: 'inbox',
  PROFILES_WORKSPACE: 'profiles-workspace',
  PROFILE_SEARCH_MONITORING: 'profile-monitoring',
  ONBOARDING_WOW_TASK_QUEUE: 'onboarding',
  PAID_WELCOME_EMAIL: 'lifecycle-email',
  MERCH_QA_GATE: 'merch-qa-gate',
  AGENT_PROFILE_CREATE: 'cli',
} as const satisfies Readonly<Record<AppFlagName, CapabilityId>>;

/**
 * Registered public claims. Statements that appear in marketing copy or
 * offer truth must literally resolve in their `source` file; anything that
 * cannot resolve yet belongs in `claims-baseline.json` (shrink-only).
 */
export const PRODUCT_TRUTH_CLAIMS: readonly Claim[] = [
  // Offer claims — asserted from offer truth itself.
  {
    id: 'offer-free-profile',
    capabilityId: 'public-profile',
    statement: FREE_PROFILE_TRUTH,
    kind: 'offer',
    source: 'apps/web/lib/billing/offer-truth.ts',
    citation: 'FREE_PROFILE_TRUTH',
  },
  {
    id: 'offer-pro-trial',
    capabilityId: 'checkout-billing',
    statement: PRO_TRIAL_TRUTH,
    kind: 'offer',
    source: 'apps/web/lib/billing/offer-truth.ts',
    citation: 'PRO_TRIAL_TRUTH',
  },
  {
    id: 'offer-max-contact-sales',
    capabilityId: 'checkout-billing',
    statement: MAX_EARLY_ACCESS_TRUTH,
    kind: 'offer',
    source: 'apps/web/lib/billing/offer-truth.ts',
    citation: 'MAX_EARLY_ACCESS_TRUTH',
  },
  // Metric claims — numbers must trace to source, not memory.
  {
    id: 'metric-pro-trial-days',
    capabilityId: 'checkout-billing',
    statement: `${PRO_TRIAL_DURATION_DAYS}-day Pro trial`,
    kind: 'metric',
    source: 'apps/web/lib/billing/offer-truth.ts',
    citation: 'PRO_TRIAL_DURATION_DAYS',
  },
  {
    id: 'metric-pro-monthly-price',
    capabilityId: 'checkout-billing',
    statement: 'Pro is priced at $199/month.',
    kind: 'metric',
    source: 'apps/web/lib/config/plan-prices.ts',
    citation: 'monthlyUsd: 199',
  },
  // Capability claims — statements lifted from published marketing copy.
  {
    id: 'copy-jovie-card-hero',
    capabilityId: 'jovie-card',
    statement: 'Your Jovie profile. Ready for the real world.',
    kind: 'capability',
    source: 'apps/web/data/jovieCardCopy.ts',
  },
  {
    id: 'copy-artist-profiles-hero',
    capabilityId: 'artist-profiles',
    statement: 'The link your music deserves.',
    kind: 'capability',
    source: 'apps/web/data/artistProfileCopy.ts',
  },
  {
    id: 'copy-artist-notifications-hero',
    capabilityId: 'artist-notifications',
    statement: 'Capture every fan.',
    kind: 'capability',
    source: 'apps/web/data/artistNotificationsCopy.ts',
  },
  {
    id: 'copy-instant-merch-hero',
    capabilityId: 'instant-merch',
    statement: 'Make the drop before the moment passes.',
    kind: 'capability',
    source: 'apps/web/data/instantMerchCopy.ts',
  },
  {
    id: 'copy-youtube-thumbnails-hero',
    capabilityId: 'youtube-thumbnails',
    statement: 'Paste your channel. See three thumbnails, redone.',
    kind: 'capability',
    source: 'apps/web/data/youtubeThumbnailsCopy.ts',
  },
  {
    id: 'copy-public-profile-hero',
    capabilityId: 'public-profile',
    statement: 'Your living identity on the internet.',
    kind: 'capability',
    source: 'apps/web/data/productCopy.ts',
  },
  {
    id: 'copy-launch-hero',
    capabilityId: 'release-launch',
    statement: 'Turn the next release into a working plan.',
    kind: 'capability',
    source: 'apps/web/data/homepageLaunchCopy.ts',
  },
  // Comparison claim — pricing comparison chart naming.
  {
    id: 'compare-pre-save-row',
    capabilityId: 'pre-save',
    statement: 'Pre-save campaigns',
    kind: 'comparison',
    source: 'apps/web/lib/entitlements/registry.ts',
    citation: 'PRICING_COMPARISON',
  },
];

/** Fail-closed capability lookup. */
export function getCapability(
  capabilityId: string | null | undefined
): Capability | null {
  if (!capabilityId) return null;
  return (
    (PRODUCT_TRUTH_CAPABILITIES as Readonly<Record<string, Capability>>)[
      capabilityId
    ] ?? null
  );
}

/** All claims asserted for a capability. */
export function getClaimsForCapability(
  capabilityId: CapabilityId
): readonly Claim[] {
  return PRODUCT_TRUTH_CLAIMS.filter(
    claim => claim.capabilityId === capabilityId
  );
}

/**
 * Claim-shape validation. Returns a list of problems (empty when valid).
 * A claim fails when: it has no `source`, its `capabilityId` is unknown, or
 * a metric claim carries no `citation` anchor.
 */
export function validateClaim(claim: Claim): readonly string[] {
  const problems: string[] = [];
  if (!claim.source || claim.source.trim().length === 0) {
    problems.push(`claim ${claim.id} has no source`);
  }
  if (!getCapability(claim.capabilityId)) {
    problems.push(`claim ${claim.id} references unknown capability`);
  }
  if (
    claim.kind === 'metric' &&
    (!claim.citation || claim.citation.trim().length === 0)
  ) {
    problems.push(`metric claim ${claim.id} has no citation`);
  }
  return problems;
}
