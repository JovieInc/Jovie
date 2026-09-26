import { ARTIST_VISIBILITY_OFFER_CONTRACT_ID } from '@/lib/billing/offer-truth';

/**
 * Shared feature availability + publication contract (JOV-6216).
 *
 * Models four decisions that must stay distinct:
 * - `maturity` — how built the feature is (proposed → GA). Owned upstream by
 *   the JOV-6223 capability registry; this file is the public-route
 *   projection of that state.
 * - `publication` — permission to announce/publish the feature publicly.
 * - `access` — permission to actually use the feature.
 * - `pricingEligible` — derived; a feature is purchasable only when it has
 *   a canonical offer reference AND is not proposed.
 *
 * Search indexing, navigation, metadata, and machine-readable guidance are
 * projections of the same record. Every resolver fails closed: an unknown
 * capability, missing record, or unknown state denies rather than guesses.
 *
 * A `proposed` capability may have an approved, indexable demand-validation
 * page while the feature itself stays unavailable — the page captures
 * interest instead of claiming immediate access. An acquisition experiment
 * succeeding can never promote a proposed feature to available.
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

export interface FeatureCapabilityRecord {
  readonly capabilityId: string;
  /** Product maturity — never inferred from route existence or a role label. */
  readonly maturity: FeatureMaturity;
  /** Permission to announce/publish. */
  readonly publication: PublicationPermission;
  /** Permission to use. */
  readonly access: FeatureAccessState;
  /** Explicit audience scope: 'general' pages must not require music fields. */
  readonly audience: FeatureAudienceScope;
  /**
   * Canonical offer reference. Reuse `ARTIST_VISIBILITY_OFFER_CONTRACT_ID`
   * (JOV-6231 writer owns offer/acquisition truth). Absent = not for sale.
   */
  readonly offerId?: string;
  /** Supported jobs/capabilities this feature delivers. */
  readonly supportedJobs: readonly string[];
  /** Whether the attached proof has publication authorization. */
  readonly proofAuthorized: boolean;
  /** Real content revision (ISO date) — drives derived lastmod outputs. */
  readonly contentRevision: string;
  /**
   * Public access label for non-GA published pages. Required when the page
   * is published while access is not 'open' — demand-validation pages must
   * label interest capture instead of claiming immediate access.
   */
  readonly accessLabel?: string;
}

export const MARKETING_FEATURE_CAPABILITIES = {
  'jovie-card': {
    capabilityId: 'jovie-card',
    maturity: 'proposed',
    publication: 'public',
    access: 'interest_capture',
    audience: 'general',
    supportedJobs: ['in-person profile sharing', 'card interest capture'],
    proofAuthorized: true,
    contentRevision: '2026-09-19',
    accessLabel:
      'Jovie Card is planned, not available yet — join the list to register interest.',
  },
  voice: {
    capabilityId: 'voice',
    maturity: 'limited_testing',
    publication: 'unlisted',
    access: 'enrolled',
    audience: 'general',
    supportedJobs: ['voice-assisted profile actions'],
    proofAuthorized: true,
    contentRevision: '2026-07-11',
    accessLabel: 'Voice is in limited testing and is not open to everyone.',
  },
  'smart-links': {
    capabilityId: 'smart-links',
    maturity: 'general_availability',
    publication: 'public',
    access: 'open',
    audience: 'icp',
    offerId: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
    supportedJobs: ['release smart links', 'remembered fan platform choice'],
    proofAuthorized: true,
    contentRevision: '2026-08-01',
  },
  'artist-profiles': {
    capabilityId: 'artist-profiles',
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
  },
  'artist-notifications': {
    capabilityId: 'artist-notifications',
    maturity: 'general_availability',
    publication: 'public',
    access: 'enrolled',
    audience: 'icp',
    offerId: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
    supportedJobs: ['opt-in fan notifications', 'audience reactivation'],
    proofAuthorized: true,
    contentRevision: '2026-08-01',
  },
  'instant-merch': {
    capabilityId: 'instant-merch',
    maturity: 'limited_testing',
    publication: 'public',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['merch concept generation'],
    proofAuthorized: true,
    contentRevision: '2026-08-01',
    accessLabel:
      'Instant Merch is in limited testing inside the authenticated workspace.',
  },
  'youtube-thumbnails': {
    capabilityId: 'youtube-thumbnails',
    maturity: 'public_beta',
    publication: 'public',
    access: 'open',
    audience: 'icp',
    supportedJobs: ['youtube thumbnail preview', 'channel packaging'],
    proofAuthorized: true,
    contentRevision: '2026-08-01',
  },
  pay: {
    capabilityId: 'pay',
    maturity: 'public_beta',
    publication: 'public',
    access: 'enrolled',
    audience: 'icp',
    supportedJobs: ['artist payment surface'],
    proofAuthorized: true,
    contentRevision: '2026-08-01',
    accessLabel: 'Jovie Pay is in public beta for enrolled artists.',
  },
  'release-launch': {
    capabilityId: 'release-launch',
    maturity: 'general_availability',
    publication: 'public',
    access: 'enrolled',
    audience: 'icp',
    offerId: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
    supportedJobs: ['release launch planning'],
    proofAuthorized: true,
    contentRevision: '2026-08-01',
  },
  cli: {
    capabilityId: 'cli',
    maturity: 'general_availability',
    publication: 'public',
    access: 'open',
    audience: 'icp',
    supportedJobs: ['read-only public artist data from the command line'],
    proofAuthorized: true,
    contentRevision: '2026-08-01',
  },
  'public-profile': {
    capabilityId: 'public-profile',
    maturity: 'general_availability',
    publication: 'public',
    access: 'open',
    audience: 'general',
    offerId: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
    supportedJobs: ['claimable public profile page'],
    proofAuthorized: true,
    contentRevision: '2026-09-17',
  },
  'app-download': {
    capabilityId: 'app-download',
    maturity: 'general_availability',
    publication: 'public',
    access: 'open',
    audience: 'general',
    supportedJobs: ['install the Jovie app'],
    proofAuthorized: true,
    contentRevision: '2026-08-01',
  },
} as const satisfies Readonly<Record<string, FeatureCapabilityRecord>>;

export type MarketingCapabilityId = keyof typeof MARKETING_FEATURE_CAPABILITIES;

/**
 * Canonical route URL → capability binding. Routes without a binding carry
 * no capability claim (editorial, legal, company pages) and are governed by
 * the route manifest alone — a binding is required before a route may claim
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

const CAPABILITY_RECORDS: Readonly<Record<string, FeatureCapabilityRecord>> =
  MARKETING_FEATURE_CAPABILITIES;

function normalizePath(href: string | null | undefined): string | null {
  if (!href) return null;
  const path = href.split(/[?#]/u)[0]?.replace(/\/+$/, '') ?? '';
  return path === '' ? '/' : path;
}

function isKnownMaturity(value: string): value is FeatureMaturity {
  return (FEATURE_MATURITY_STATES as readonly string[]).includes(value);
}

/** Fail-closed lookup: unknown capability id or route → null. */
export function getRouteCapability(
  href: string | null | undefined
): FeatureCapabilityRecord | null {
  const path = normalizePath(href);
  if (!path) return null;
  const capabilityId = (
    ROUTE_CAPABILITY_BINDINGS as Readonly<Record<string, string>>
  )[path];
  if (!capabilityId) return null;
  return CAPABILITY_RECORDS[capabilityId] ?? null;
}

export function getCapabilityRecord(
  capabilityId: string | null | undefined
): FeatureCapabilityRecord | null {
  if (!capabilityId) return null;
  const record = CAPABILITY_RECORDS[capabilityId];
  if (!record || !isKnownMaturity(record.maturity)) return null;
  return record;
}

/**
 * Publication decision. `internal_only` may not surface anywhere public;
 * `unlisted` may render for direct visitors but is not announced, indexed,
 * or linked from navigation.
 */
export function isPublicationPermitted(
  record: FeatureCapabilityRecord | null
): boolean {
  return record?.publication === 'public' || record?.publication === 'unlisted';
}

/** Search-indexing eligibility — a distinct decision from publication. */
export function isCapabilityIndexable(
  record: FeatureCapabilityRecord | null
): boolean {
  return (
    record !== null &&
    record.publication === 'public' &&
    record.proofAuthorized === true
  );
}

/**
 * Navigation eligibility — internal-only and unauthorized-proof surfaces may
 * not leak into header/footer destinations.
 */
export function isCapabilityNavigable(
  record: FeatureCapabilityRecord | null
): boolean {
  return (
    record !== null &&
    record.publication !== 'internal_only' &&
    record.proofAuthorized === true
  );
}

/**
 * Pricing eligibility — purchasable requires a canonical offer reference AND
 * real availability. A proposed feature is never purchasable, regardless of
 * experiment outcomes or route existence.
 */
export function isCapabilityPurchasable(
  record: FeatureCapabilityRecord | null
): boolean {
  return (
    record !== null &&
    isKnownMaturity(record.maturity) &&
    record.maturity !== 'proposed' &&
    typeof record.offerId === 'string' &&
    record.offerId.length > 0 &&
    (record.access === 'open' || record.access === 'enrolled')
  );
}

/** User-facing access — distinct from publication permission. */
export function isFeatureUsable(
  record: FeatureCapabilityRecord | null
): boolean {
  return (
    record !== null &&
    isKnownMaturity(record.maturity) &&
    (record.access === 'open' || record.access === 'enrolled')
  );
}

/**
 * Demand-validation pages capture interest instead of granting access.
 * True when the page is allowed to publish while the feature itself is not
 * yet usable.
 */
export function isInterestCaptureOnly(
  record: FeatureCapabilityRecord | null
): boolean {
  return (
    record !== null &&
    isPublicationPermitted(record) &&
    !isFeatureUsable(record)
  );
}

/**
 * Experiment outcomes may update evidence, but can never make a proposed
 * feature available. Returns the admitted access state after an acquisition
 * experiment result; 'proposed' maturity pins access at non-usable states.
 */
export function resolvePostExperimentAccess(
  record: FeatureCapabilityRecord,
  experimentSucceeded: boolean
): FeatureAccessState {
  if (record.maturity === 'proposed') {
    return record.access === 'interest_capture'
      ? 'interest_capture'
      : 'unavailable';
  }
  if (!experimentSucceeded) return record.access;
  return record.access === 'unavailable' ? 'enrolled' : record.access;
}

/**
 * Access description for public surfaces. Non-GA published pages must carry
 * their honest `accessLabel`; missing labels fail closed to "not available".
 */
export function describeFeatureAccess(
  record: FeatureCapabilityRecord | null
): string {
  if (!record) return 'Not available.';
  if (record.access === 'open' && record.maturity === 'general_availability') {
    return 'Available now.';
  }
  if (record.access === 'open') return 'Available now in public beta.';
  if (record.access === 'enrolled') {
    return record.accessLabel ?? 'In limited testing — access is enrolled.';
  }
  if (record.access === 'interest_capture') {
    return (
      record.accessLabel ?? 'Planned — join the list to register interest.'
    );
  }
  return 'Not available.';
}

/**
 * Route-level helpers consumed by navigation data and projections. Hrefs with
 * fragments or query strings normalize to their pathname before lookup.
 */
export function isNavigationEligiblePath(href: string): boolean {
  const record = getRouteCapability(href);
  if (!record) return true; // unbound routes are governed by the manifest alone
  return isCapabilityNavigable(record);
}

export function isIndexableCapabilityPath(path: string): boolean {
  const record = getRouteCapability(path);
  if (!record) return true;
  return isCapabilityIndexable(record);
}
