import { ARTIST_VISIBILITY_OFFER_CONTRACT_ID } from '@/lib/billing/offer-truth';
import type {
  BooleanEntitlement,
  NumericEntitlement,
} from '@/lib/entitlements/registry';
import type { CodeFlagName } from '@/lib/flags/code-flags';
import type { AppFlagName } from '@/lib/flags/contracts';
import type { MarketingStaticFlagName } from '@/lib/flags/marketing-static';
import { INTERNAL_FLAG_CAPABILITIES } from './internal-flags';
import { PUBLIC_ACCESS_FLAG_CAPABILITIES } from './public-access-flags';
import type {
  FeatureAccessState,
  FeatureAudienceScope,
  FeatureMaturity,
  PublicationPermission,
} from './registry.constants';
import type { Capability, Claim } from './registry.schema';

/**
 * Product-truth capability + claim registry (JOV-6223 / JOV-7247).
 *
 * One record per customer-facing capability. Marketing availability
 * (`data/marketing/featureAvailability.ts`), pricing features, and factory
 * page claims are projections of this file, never parallel hand-authored
 * truth. Four decisions stay distinct on every capability:
 * - `maturity`: how built the feature is (proposed → GA).
 * - `publication`: permission to announce it publicly.
 * - `access`: permission to actually use it.
 * - offer eligibility: derived from the marketing `offerId` + maturity.
 *
 * Capabilities without a `marketing` block are product-only records that
 * exist so every entitlement key and product flag resolves to a truth record.
 * They are seeded conservatively: entitlements already sold in the public Pro
 * list are `limited_testing` + `enrolled` (Pro itself is limited access), and
 * entitlements no public plan grants are `proposed` + `internal_only`.
 */

export type {
  ClaimKind,
  ClaimSource,
  FeatureAccessState,
  FeatureAudienceScope,
  FeatureMaturity,
  PublicationPermission,
} from './registry.constants';
export {
  CLAIM_KINDS,
  CLAIM_SOURCES,
  FEATURE_ACCESS_STATES,
  FEATURE_AUDIENCE_SCOPES,
  FEATURE_MATURITY_STATES,
  PUBLICATION_PERMISSIONS,
} from './registry.constants';

export type EntitlementKey = BooleanEntitlement | NumericEntitlement;
export type ProductFlagKey = AppFlagName | CodeFlagName;

/** Public-route projection fields (JOV-6216) for marketing capabilities. */
export interface CapabilityMarketingProjection {
  /** Explicit audience scope: 'general' pages must not require music fields. */
  readonly audience: FeatureAudienceScope;
  /** Canonical offer reference. Absent = not for sale. */
  readonly offerId?: string;
  /** Supported jobs/capabilities this feature delivers. */
  readonly supportedJobs: readonly string[];
  /** Whether the attached proof has publication authorization. */
  readonly proofAuthorized: boolean;
  /** Real content revision (ISO date); drives derived lastmod outputs. */
  readonly contentRevision: string;
  /**
   * Public access label for non-GA published pages. Demand-validation pages
   * must label interest capture instead of claiming immediate access.
   */
  readonly accessLabel?: string;
}

export interface CapabilityDefinition {
  readonly maturity: FeatureMaturity;
  readonly publication: PublicationPermission;
  readonly access: FeatureAccessState;
  readonly entitlementKeys: readonly EntitlementKey[];
  /** Primary gating flag, when one flag gates the whole capability. */
  readonly flagKey?: ProductFlagKey;
  readonly evidence: {
    /** Screenshot scenario ids (`lib/screenshots/registry.ts`). */
    readonly captureScenarios: readonly string[];
    /**
     * Routes that render claims for this capability beyond the marketing
     * route bindings below (for example `/pricing` for offer truth).
     */
    readonly routes: readonly string[];
  };
  readonly marketing?: CapabilityMarketingProjection;
}

// The zod schemas live in registry.schema.ts. The marketing footer and
// navigation read this registry on every public page, so it stays free of
// zod (a type-only re-export is erased from the bundle).
export type { Capability, Claim };

export const PRODUCT_CAPABILITIES = {
  'jovie-card': {
    maturity: 'proposed',
    publication: 'public',
    access: 'interest_capture',
    entitlementKeys: [],
    evidence: { captureScenarios: [], routes: [] },
    marketing: {
      audience: 'general',
      supportedJobs: ['in-person profile sharing', 'card interest capture'],
      proofAuthorized: true,
      contentRevision: '2026-09-19',
      accessLabel:
        'Jovie Card is planned and not available yet. Join the list to register interest.',
    },
  },
  voice: {
    maturity: 'limited_testing',
    publication: 'unlisted',
    access: 'enrolled',
    entitlementKeys: [],
    evidence: { captureScenarios: [], routes: [] },
    marketing: {
      audience: 'general',
      supportedJobs: ['voice-assisted profile actions'],
      proofAuthorized: true,
      contentRevision: '2026-07-11',
      accessLabel: 'Voice is in limited testing and is not open to everyone.',
    },
  },
  'smart-links': {
    maturity: 'general_availability',
    publication: 'public',
    access: 'open',
    entitlementKeys: [
      'canEditSmartLinks',
      'smartLinksLimit',
      'canAccessPreSave',
      'canAccessUrlEncryption',
    ],
    evidence: {
      captureScenarios: [
        'release-landing-desktop',
        'release-landing-mobile',
        'release-presave-mobile',
        'artist-spec-tracked-links-desktop',
      ],
      routes: [],
    },
    marketing: {
      audience: 'icp',
      offerId: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
      supportedJobs: ['release smart links', 'remembered fan platform choice'],
      proofAuthorized: true,
      contentRevision: '2026-08-01',
    },
  },
  'artist-profiles': {
    maturity: 'general_availability',
    publication: 'public',
    access: 'open',
    entitlementKeys: [],
    evidence: {
      captureScenarios: [
        'tim-white-profile-live-desktop',
        'tim-white-profile-mock-home-mobile',
      ],
      routes: [],
    },
    marketing: {
      audience: 'icp',
      offerId: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
      supportedJobs: [
        'public artist profile',
        'audience capture',
        'fan reactivation',
      ],
      proofAuthorized: true,
      contentRevision: '2026-08-01',
    },
  },
  'artist-notifications': {
    maturity: 'general_availability',
    publication: 'public',
    access: 'enrolled',
    entitlementKeys: ['canSendNotifications'],
    evidence: {
      captureScenarios: ['tim-white-profile-alerts-fallback-mobile'],
      routes: [],
    },
    marketing: {
      audience: 'icp',
      offerId: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
      supportedJobs: ['opt-in fan notifications', 'audience reactivation'],
      proofAuthorized: true,
      contentRevision: '2026-08-01',
    },
  },
  'instant-merch': {
    maturity: 'limited_testing',
    publication: 'public',
    access: 'enrolled',
    entitlementKeys: ['canAccessMerchCreation'],
    flagKey: 'MERCH_MVP',
    evidence: { captureScenarios: [], routes: [] },
    marketing: {
      audience: 'icp',
      supportedJobs: ['merch concept generation'],
      proofAuthorized: true,
      contentRevision: '2026-08-01',
      accessLabel:
        'Instant Merch is in limited testing inside the authenticated workspace.',
    },
  },
  'youtube-thumbnails': {
    maturity: 'public_beta',
    publication: 'public',
    access: 'open',
    entitlementKeys: [],
    evidence: { captureScenarios: [], routes: [] },
    marketing: {
      audience: 'icp',
      supportedJobs: ['youtube thumbnail preview', 'channel packaging'],
      proofAuthorized: true,
      contentRevision: '2026-08-01',
    },
  },
  pay: {
    maturity: 'public_beta',
    publication: 'public',
    access: 'enrolled',
    entitlementKeys: ['canAccessTipping', 'canAccessStripeConnect'],
    evidence: {
      captureScenarios: ['dashboard-earnings-desktop'],
      routes: [],
    },
    marketing: {
      audience: 'icp',
      supportedJobs: ['artist payment surface'],
      proofAuthorized: true,
      contentRevision: '2026-08-01',
      accessLabel: 'Jovie Pay is in public beta for enrolled artists.',
    },
  },
  'release-launch': {
    maturity: 'general_availability',
    publication: 'public',
    access: 'enrolled',
    entitlementKeys: [
      'canCreateManualReleases',
      'canAccessFutureReleases',
      'canAccessTasksWorkspace',
      'canGenerateReleasePlans',
      'canAccessMetadataSubmissionAgent',
    ],
    evidence: {
      captureScenarios: ['release-tasks-desktop', 'dashboard-releases-desktop'],
      routes: [],
    },
    marketing: {
      audience: 'icp',
      offerId: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
      supportedJobs: ['release launch planning'],
      proofAuthorized: true,
      contentRevision: '2026-08-01',
    },
  },
  cli: {
    maturity: 'general_availability',
    publication: 'public',
    access: 'open',
    entitlementKeys: [],
    flagKey: 'AGENT_PROFILE_CREATE',
    evidence: { captureScenarios: [], routes: [] },
    marketing: {
      audience: 'icp',
      supportedJobs: ['read-only public artist data from the command line'],
      proofAuthorized: true,
      contentRevision: '2026-08-01',
    },
  },
  'public-profile': {
    maturity: 'general_availability',
    publication: 'public',
    access: 'open',
    entitlementKeys: [],
    evidence: {
      captureScenarios: ['public-profile-desktop', 'public-profile-mobile'],
      routes: ['/pricing'],
    },
    marketing: {
      audience: 'general',
      offerId: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
      supportedJobs: ['claimable public profile page'],
      proofAuthorized: true,
      contentRevision: '2026-09-17',
    },
  },
  'app-download': {
    maturity: 'general_availability',
    publication: 'public',
    access: 'open',
    entitlementKeys: [],
    evidence: { captureScenarios: [], routes: [] },
    marketing: {
      audience: 'general',
      supportedJobs: ['install the Jovie app'],
      proofAuthorized: true,
      contentRevision: '2026-08-01',
    },
  },
  /**
   * Agent-readable profile summary. Every indexable public profile serves
   * plain text at `/{username}/llms.txt`
   * (`apps/web/app/[username]/llms.txt/route.ts`; covered by
   * `apps/web/tests/unit/profile/artist-llms-txt-route.test.ts`). Live in
   * production as `text/plain` with entity identity, claim and verification
   * status, location, genres, and stream links. No feature flag. The
   * screenshot registry has no scenario for a text response.
   */
  'agent-readable-profile-summary': {
    maturity: 'general_availability',
    publication: 'public',
    access: 'open',
    entitlementKeys: [],
    evidence: {
      captureScenarios: [],
      routes: ['/{username}/llms.txt'],
    },
    marketing: {
      audience: 'general',
      supportedJobs: ['machine-readable public profile summary'],
      proofAuthorized: true,
      contentRevision: '2026-09-16',
    },
  },
  /**
   * Public Ask on profiles. `AskJovieWidget`
   * (`apps/web/components/features/ask-jovie/AskJovieWidget.tsx`, tests in
   * `AskJovieWidget.test.tsx`) mounts for anonymous visitors from
   * `apps/web/app/[username]/page.tsx` and posts to
   * `apps/web/app/api/profile/[username]/ask/route.ts` (route tests alongside
   * that file). No feature flag; the page omits it only when
   * `PUBLIC_NOAUTH_SMOKE=1`. The launcher is in the production profile HTML.
   * Golden-path keyframe `anonymous-chat` drives `/start` onboarding, not
   * this widget, and no screenshot scenario id covers the launcher.
   */
  'public-ask': {
    maturity: 'general_availability',
    publication: 'public',
    access: 'open',
    entitlementKeys: [],
    evidence: {
      captureScenarios: [],
      routes: ['/{username}', '/api/profile/{username}/ask'],
    },
    marketing: {
      audience: 'general',
      supportedJobs: ['anonymous Ask on a public profile'],
      proofAuthorized: true,
      contentRevision: '2026-09-30',
    },
  },
  /**
   * Selective reach ("Send less. Matter more.", JOV-6299). The copy line is
   * founder-approved, but presenting it as working Jovie behavior is gated on
   * certified segments, real preview/approval/scheduling/send paths, consent
   * and quiet-hours handling, capped-send pricing (JOV-6229), and proof that
   * the delivery states are real policy decisions. None is certified yet, so
   * the capability stays internal-only and unavailable with unauthorized
   * proof. "Coming soon" demand capture is permitted only through this record.
   */
  'selective-reach': {
    maturity: 'proposed',
    publication: 'internal_only',
    access: 'unavailable',
    entitlementKeys: [],
    evidence: { captureScenarios: [], routes: [] },
    marketing: {
      audience: 'general',
      supportedJobs: [
        'relevance-scoped update delivery',
        'send now, later, or do-not-interrupt decisions',
      ],
      proofAuthorized: false,
      contentRevision: '2026-09-28',
    },
  },

  // Product-only capabilities: sold in plan lists or gated by entitlements,
  // with no dedicated marketing route yet.
  analytics: {
    maturity: 'limited_testing',
    publication: 'public',
    access: 'enrolled',
    entitlementKeys: [
      'canAccessAdvancedAnalytics',
      'canFilterSelfFromAnalytics',
      'analyticsRetentionDays',
    ],
    evidence: {
      captureScenarios: [
        'dashboard-analytics-desktop',
        'artist-spec-geo-insights-desktop',
      ],
      routes: ['/pricing'],
    },
  },
  'automatic-links': {
    maturity: 'proposed',
    publication: 'internal_only',
    access: 'unavailable',
    entitlementKeys: ['canAutoCreateLinks'],
    evidence: { captureScenarios: [], routes: [] },
  },
  'fan-crm': {
    maturity: 'limited_testing',
    publication: 'public',
    access: 'enrolled',
    entitlementKeys: ['canExportContacts', 'contactsLimit'],
    evidence: {
      captureScenarios: ['dashboard-audience-desktop'],
      routes: ['/pricing'],
    },
  },
  'ai-assistant': {
    maturity: 'limited_testing',
    publication: 'public',
    access: 'enrolled',
    entitlementKeys: [
      'aiCanUseTools',
      'aiWeeklyMessageLimit',
      'aiPitchGenPerRelease',
      'chatFileUploadLimit',
    ],
    evidence: { captureScenarios: [], routes: ['/pricing'] },
  },
  'ad-pixels': {
    maturity: 'limited_testing',
    publication: 'public',
    access: 'enrolled',
    entitlementKeys: ['canAccessAdPixels'],
    evidence: { captureScenarios: [], routes: ['/pricing'] },
  },
  'verified-badge': {
    maturity: 'limited_testing',
    publication: 'public',
    access: 'enrolled',
    entitlementKeys: ['canBeVerified'],
    evidence: { captureScenarios: [], routes: ['/pricing'] },
  },
  'album-art-generation': {
    maturity: 'limited_testing',
    publication: 'internal_only',
    access: 'enrolled',
    entitlementKeys: ['canGenerateAlbumArt'],
    flagKey: 'ALBUM_ART_GENERATION',
    evidence: { captureScenarios: [], routes: [] },
  },
  'ai-retouching': {
    maturity: 'limited_testing',
    publication: 'internal_only',
    access: 'enrolled',
    entitlementKeys: ['canAccessAiRetouching', 'aiRetouchDailyLimit'],
    evidence: { captureScenarios: [], routes: [] },
  },
  inbox: {
    maturity: 'limited_testing',
    publication: 'internal_only',
    access: 'enrolled',
    entitlementKeys: ['canAccessInbox'],
    evidence: { captureScenarios: [], routes: [] },
  },
  'profile-monitoring': {
    maturity: 'limited_testing',
    publication: 'internal_only',
    access: 'enrolled',
    entitlementKeys: ['profileMonitoringLimit'],
    flagKey: 'PROFILE_SEARCH_MONITORING',
    evidence: { captureScenarios: [], routes: [] },
  },
  'priority-support': {
    maturity: 'limited_testing',
    publication: 'public',
    access: 'enrolled',
    entitlementKeys: [],
    evidence: { captureScenarios: [], routes: ['/pricing'] },
  },
  'fan-subscriptions': {
    maturity: 'proposed',
    publication: 'internal_only',
    access: 'unavailable',
    entitlementKeys: ['canAccessFanSubscriptions'],
    evidence: { captureScenarios: [], routes: [] },
  },
  'email-campaigns': {
    maturity: 'proposed',
    publication: 'internal_only',
    access: 'unavailable',
    entitlementKeys: ['canAccessEmailCampaigns'],
    evidence: { captureScenarios: [], routes: [] },
  },
  'developer-api': {
    maturity: 'proposed',
    publication: 'internal_only',
    access: 'unavailable',
    entitlementKeys: ['canAccessApiKeys', 'canAccessWebhooks'],
    evidence: { captureScenarios: [], routes: [] },
  },
  'team-management': {
    maturity: 'proposed',
    publication: 'internal_only',
    access: 'unavailable',
    entitlementKeys: ['canAccessTeamManagement'],
    evidence: { captureScenarios: [], routes: [] },
  },
  'white-label': {
    maturity: 'proposed',
    publication: 'internal_only',
    access: 'unavailable',
    entitlementKeys: ['canAccessWhiteLabel'],
    evidence: { captureScenarios: [], routes: [] },
  },
  'ab-testing': {
    maturity: 'proposed',
    publication: 'internal_only',
    access: 'unavailable',
    entitlementKeys: ['canAccessAbTesting'],
    evidence: { captureScenarios: [], routes: [] },
  },
} as const satisfies Readonly<Record<string, CapabilityDefinition>>;

export type ProductCapabilityId = keyof typeof PRODUCT_CAPABILITIES;

/** Capabilities that carry a public-route projection. */
export type MarketingCapabilityId = {
  [K in ProductCapabilityId]: (typeof PRODUCT_CAPABILITIES)[K] extends {
    readonly marketing: CapabilityMarketingProjection;
  }
    ? K
    : never;
}[ProductCapabilityId];

/**
 * Canonical route URL → capability binding. Routes without a binding carry
 * no capability claim (editorial, legal, company pages) and are governed by
 * the route manifest alone. A binding is required before a route may claim
 * availability for a feature.
 */
export const ROUTE_CAPABILITY_BINDINGS = {
  '/card': 'jovie-card',
  '/voice': 'voice',
  '/smart-links': 'smart-links',
  '/artist-profiles': 'artist-profiles',
  '/artist-notifications': 'artist-notifications',
  '/instant-merch': 'instant-merch',
  '/youtube-thumbnails': 'youtube-thumbnails',
  '/pay': 'pay',
  '/launch': 'release-launch',
  '/cli': 'cli',
  '/product': 'public-profile',
  '/new': 'release-launch',
  '/download': 'app-download',
} as const satisfies Readonly<Record<string, MarketingCapabilityId>>;

/**
 * Flag → capability map. Every app flag and code flag is either bound to the
 * capability it gates or explicitly declared non-marketing with a reason, so
 * a new flag cannot silently gate an unregistered public capability.
 */
export type FlagCapabilityBinding =
  | { readonly capabilityId: ProductCapabilityId }
  | { readonly nonMarketing: string };

export const PRODUCT_FLAG_CAPABILITIES = {
  YOUTUBE_WORKSPACE_NAV: {
    nonMarketing:
      'default-off workspace navigation; no public capability claim',
  },
  JOVIE_WORK_NAV: {
    nonMarketing:
      'default-off workspace navigation; no public capability claim',
  },
  BILLING_UPGRADE_DIRECT: { nonMarketing: 'billing checkout routing' },
  SMARTLINK_PRE_SAVE: { capabilityId: 'smart-links' },
  IOS_APPLE_MUSIC_PRIORITY: { nonMarketing: 'platform ordering heuristic' },
  STRIPE_CONNECT_ENABLED: { capabilityId: 'pay' },
  PLAYLIST_ENGINE: { nonMarketing: 'internal playlist generation job' },
  ALBUM_ART_GENERATION: { capabilityId: 'album-art-generation' },
  CHAT_JANK_MONITOR: { nonMarketing: 'client performance telemetry' },
  APPLE_WALLET_PROFILE_PASS: {
    nonMarketing: 'wallet pass rollout; no public claim yet',
  },
  RELEASE_PLAN_DEMO: { capabilityId: 'release-launch' },
  RELEASE_TO_REVENUE_AUTOPILOT: { capabilityId: 'release-launch' },
  AI_CONNECTORS_BETA: { capabilityId: 'ai-assistant' },
  MERCH_MVP: { capabilityId: 'instant-merch' },
  BULK_PRESS_PHOTO_IMPORT: { nonMarketing: 'workspace import utility' },
  TELEPROMPTER_RECORDING: { nonMarketing: 'internal recording tool' },
  PROFILE_SEARCH_MONITORING: { capabilityId: 'profile-monitoring' },
  ONBOARDING_WOW_TASK_QUEUE: { nonMarketing: 'onboarding orchestration' },
  PAID_WELCOME_EMAIL: { nonMarketing: 'transactional email kill switch' },
  AGENT_PROFILE_CREATE: { capabilityId: 'cli' },
  CREATOR_FINANCE: {
    nonMarketing: 'owner-only finance release gate; no public claim (JOV-4621)',
  },
  OUTBOUND_DOGFOOD_GATE: {
    nonMarketing:
      'internal outbound draft visibility; default off outside tests; no send authority (JOV-12380)',
  },
  VISIBILITY_AUDIT_OFFER: {
    nonMarketing: 'hidden until the flag and a Stripe Payment Link are set',
  },
  ONBOARDING_VALUE_BEFORE_PAYWALL: {
    nonMarketing:
      'onboarding funnel order: real catalog preview before pricing; env kill switch (JOV-9758)',
  },
  MEMORY_STUDIO_SESSION_V0: { nonMarketing: 'internal memory loop' },
  YOUTUBE_THUMBNAILS_PASTE_GENERATE: { capabilityId: 'youtube-thumbnails' },
  MARKETING_GENERIC_CREATOR_NAV: {
    nonMarketing:
      'marketing copy presentation; default on, env kill switch; does not change smart-link certification (JOV-7580)',
  },
  ...PUBLIC_ACCESS_FLAG_CAPABILITIES,
  CHATGPT_APP_DIRECTORY_MCP: {
    nonMarketing:
      'ChatGPT directory MCP kill switch; anonymous public creator reads; default off',
  },
  ...INTERNAL_FLAG_CAPABILITIES,
  SOCIAL_HTML_ISOLATED_PROVIDER: {
    nonMarketing:
      'internal ingestion routing kill switch; reserved for future isolated provider rollout',
  },
  STRIPE_TEST_PRICE_CONFIGURED: {
    nonMarketing:
      'CI Stripe test-price secret readiness; default off names the missing GitHub secret and still fails closed',
  },
  INVESTOR_PORTAL_YC_DECK: {
    nonMarketing:
      'investor brief section order; default off until founder design approval',
  },
  CLAIM_LEGACY_PROOF_SWEEP: {
    nonMarketing:
      'daily sweep over grandfathered claims; default off; no public capability claim',
  },
  OVIE_FLEET_ROOM: {
    nonMarketing:
      'Ovie operator fleet room; admins only; no customer or public capability claim',
  },
} as const satisfies Readonly<Record<ProductFlagKey, FlagCapabilityBinding>>;

/**
 * Marketing-static flags only show or hide presentation sections; they never
 * change what a capability can do. Any static flag outside this rule must be
 * added to `PRODUCT_FLAG_CAPABILITIES` instead.
 */
export const MARKETING_STATIC_PRESENTATION_FLAG_PATTERN = /^SHOW_[A-Z0-9_]+$/u;
export const MARKETING_STATIC_ACCESS_FLAGS = [
  'WAITLIST_ENABLED',
] as const satisfies readonly MarketingStaticFlagName[];

const CAPABILITY_ENTRIES = Object.entries(
  PRODUCT_CAPABILITIES
) as ReadonlyArray<[ProductCapabilityId, CapabilityDefinition]>;

/** Materialized capability records (id included), for validation + sync. */
export function listCapabilities(): readonly Capability[] {
  return CAPABILITY_ENTRIES.map(([id, definition]) => {
    const { marketing, ...rest } = definition;
    const capability: Capability = {
      id,
      ...rest,
      entitlementKeys: [...definition.entitlementKeys],
      evidence: {
        captureScenarios: [...definition.evidence.captureScenarios],
        routes: [...definition.evidence.routes],
      },
    };
    if (marketing) {
      capability.marketing = {
        ...marketing,
        supportedJobs: [...marketing.supportedJobs],
      };
    }
    return capability;
  });
}

export function getProductCapability(
  capabilityId: string | null | undefined
): CapabilityDefinition | null {
  if (!capabilityId) return null;
  return (
    (PRODUCT_CAPABILITIES as Readonly<Record<string, CapabilityDefinition>>)[
      capabilityId
    ] ?? null
  );
}

/** Every route that renders this capability's claims, sorted and unique. */
export function getCapabilityRoutes(capabilityId: string): readonly string[] {
  const routes = new Set<string>(
    getProductCapability(capabilityId)?.evidence.routes ?? []
  );
  for (const [route, boundId] of Object.entries(ROUTE_CAPABILITY_BINDINGS)) {
    if (boundId === capabilityId) routes.add(route);
  }
  return [...routes].sort();
}

/** Capability that owns an entitlement key, or null when unmapped. */
export function getEntitlementCapabilityId(
  key: string
): ProductCapabilityId | null {
  for (const [id, definition] of CAPABILITY_ENTRIES) {
    if ((definition.entitlementKeys as readonly string[]).includes(key)) {
      return id;
    }
  }
  return null;
}
