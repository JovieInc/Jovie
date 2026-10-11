import {
  type CapabilityDefinition,
  FEATURE_MATURITY_STATES,
  type FeatureAccessState,
  type FeatureAudienceScope,
  type FeatureMaturity,
  type MarketingCapabilityId,
  PRODUCT_CAPABILITIES,
  type PublicationPermission,
  ROUTE_CAPABILITY_BINDINGS,
} from '@/data/product-truth/registry';

export {
  FEATURE_ACCESS_STATES,
  FEATURE_AUDIENCE_SCOPES,
  FEATURE_MATURITY_STATES,
  type FeatureAccessState,
  type FeatureAudienceScope,
  type FeatureMaturity,
  type MarketingCapabilityId,
  PUBLICATION_PERMISSIONS,
  type PublicationPermission,
  ROUTE_CAPABILITY_BINDINGS,
} from '@/data/product-truth/registry';

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

function projectCapability(
  capabilityId: string,
  definition: CapabilityDefinition
): FeatureCapabilityRecord | null {
  if (!definition.marketing) return null;
  return {
    capabilityId,
    maturity: definition.maturity,
    publication: definition.publication,
    access: definition.access,
    ...definition.marketing,
  };
}

/**
 * Public-route projection of the product-truth registry
 * (`data/product-truth/registry.ts`). Only capabilities with a `marketing`
 * block appear here; product-only capabilities never leak into public routes.
 */
export const MARKETING_FEATURE_CAPABILITIES = Object.fromEntries(
  Object.entries(
    PRODUCT_CAPABILITIES as Readonly<Record<string, CapabilityDefinition>>
  ).flatMap(([capabilityId, definition]) => {
    const record = projectCapability(capabilityId, definition);
    return record ? [[capabilityId, record] as const] : [];
  })
) as Readonly<Record<MarketingCapabilityId, FeatureCapabilityRecord>>;

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
