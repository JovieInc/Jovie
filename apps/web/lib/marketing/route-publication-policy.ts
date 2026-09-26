import {
  describeFeatureAccess,
  type FeatureCapabilityRecord,
  getRouteCapability,
  isCapabilityIndexable,
  isCapabilityNavigable,
  isCapabilityPurchasable,
  isInterestCaptureOnly,
  isPublicationPermitted,
} from '@/data/marketing/featureAvailability';
import {
  getMarketingPageContractForPathname,
  type MarketingPageContract,
} from '@/data/marketing/pageContracts';
import type { SitemapManifestRoute } from '@/lib/seo/sitemap-publication';

/**
 * Route-level publication policy (JOV-6216). One policy feeds marketing
 * pages, pricing eligibility, header/footer destinations, metadata,
 * structured data, XML sitemap membership, and agent-readable descriptions.
 *
 * The projection joins three existing sources — never a parallel truth:
 * - route manifest: canonical `url`, `noindex`, `status`, `aliasOf`
 *   (indexing eligibility and lifecycle stay owned there)
 * - page contract: supported job (`job`), proof reference, copy scope
 * - capability record: maturity, publication permission, user access,
 *   audience scope, canonical offer reference, real content revision
 *
 * Publication permission, user access, product maturity, pricing
 * eligibility, and search indexing remain distinct decisions. Unknown
 * capability/publication states fail closed; route existence and role
 * labels never grant purchase or access.
 */

export interface MarketingRoutePolicy {
  readonly path: string;
  /** Canonical URL from the manifest/page contract — never invented. */
  readonly canonicalUrl: string;
  /** Page may be published (visible to direct visitors). */
  readonly publishable: boolean;
  /** Page may appear in search indexing / XML sitemap. */
  readonly indexable: boolean;
  /** Page may be linked from header/footer navigation. */
  readonly navigable: boolean;
  /** Page metadata and Open Graph may describe the feature. */
  readonly metadataAllowed: boolean;
  /** Structured data (JSON-LD) may assert the feature. */
  readonly structuredDataAllowed: boolean;
  /** llms.txt / agent-readable guidance may describe the feature. */
  readonly agentGuidanceAllowed: boolean;
  /** A checkout/purchase claim is permitted — requires a canonical offer. */
  readonly purchasable: boolean;
  /** Published page captures interest instead of granting access. */
  readonly interestCaptureOnly: boolean;
  /** Honest access description for non-GA published pages. */
  readonly accessLabel: string;
  /** Distinct audience scope — 'general' pages require no music fields. */
  readonly audience: 'general' | 'icp' | 'editorial';
  /** Real content revision for derived lastmod/cache outputs. */
  readonly contentRevision: string | null;
  /** Supported jobs/capabilities referenced by the route. */
  readonly supportedJobs: readonly string[];
}

function audienceFor(
  record: FeatureCapabilityRecord | null,
  contract: MarketingPageContract | null
): MarketingRoutePolicy['audience'] {
  if (record) return record.audience;
  if (!contract) return 'general';
  return contract.copyScope === 'editorial' ? 'editorial' : 'general';
}

/**
 * Resolve the public-route projection for a manifest entry. `entry` may be
 * omitted for non-manifest callers; capability-less routes fall back to the
 * manifest fields only.
 */
export function resolveMarketingRoutePolicy(
  entry: Pick<SitemapManifestRoute, 'url' | 'status' | 'noindex' | 'aliasOf'>
): MarketingRoutePolicy {
  const record = getRouteCapability(entry.url);
  const contract = getMarketingPageContractForPathname(entry.url);

  const manifestPublishable =
    entry.status === 'active' && entry.aliasOf === undefined;
  const publishable = record
    ? manifestPublishable &&
      isPublicationPermitted(record) &&
      record.proofAuthorized
    : manifestPublishable;
  const indexable =
    manifestPublishable &&
    entry.noindex !== true &&
    (record === null || isCapabilityIndexable(record));
  const navigable = record === null || isCapabilityNavigable(record);
  const machineAllowed =
    publishable &&
    (record === null ||
      (record.publication === 'public' && record.proofAuthorized));

  return {
    path: entry.url,
    canonicalUrl: entry.url,
    publishable,
    indexable,
    navigable,
    metadataAllowed: machineAllowed,
    structuredDataAllowed:
      machineAllowed && record !== null && !isInterestCaptureOnly(record),
    agentGuidanceAllowed: machineAllowed,
    purchasable: isCapabilityPurchasable(record),
    interestCaptureOnly: isInterestCaptureOnly(record),
    accessLabel: describeFeatureAccess(record),
    audience: audienceFor(record, contract),
    contentRevision: record?.contentRevision ?? null,
    supportedJobs: record?.supportedJobs ?? (contract ? [contract.job] : []),
  };
}

/**
 * Navigation gate for header/footer destinations. Internal-only and
 * unauthorized-proof surfaces never leak into navigation; unbound routes
 * remain governed by the manifest.
 */
export function isNavigableRoute(url: string): boolean {
  return resolveMarketingRoutePolicy({
    url,
    status: 'active',
  }).navigable;
}

/** Sitemap gate: capability bindings may deny indexing independently. */
export function isIndexableRoute(
  entry: Pick<SitemapManifestRoute, 'url' | 'status' | 'noindex' | 'aliasOf'>
): boolean {
  return resolveMarketingRoutePolicy(entry).indexable;
}
