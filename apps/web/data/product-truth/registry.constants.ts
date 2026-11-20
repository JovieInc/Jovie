/**
 * Enumerations shared by the product-truth registry and its zod schemas
 * (JOV-6223). They sit in their own module so registry.schema.ts can use them
 * without importing registry.ts, which keeps the two free of an import cycle.
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

/** Permission to announce a feature, separate from permission to use it. */
export const PUBLICATION_PERMISSIONS = [
  'internal_only',
  'unlisted',
  'public',
] as const;
export type PublicationPermission = (typeof PUBLICATION_PERMISSIONS)[number];

/** Permission to use a feature, separate from permission to announce it. */
export const FEATURE_ACCESS_STATES = [
  'unavailable',
  'interest_capture',
  'enrolled',
  'open',
] as const;
export type FeatureAccessState = (typeof FEATURE_ACCESS_STATES)[number];

export const CLAIM_KINDS = [
  'capability',
  'offer',
  'metric',
  'comparison',
] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

/**
 * Where a claim's truth comes from. `offer-truth`, `entitlements`, and
 * `feature` are derived from code; `external-cited` and `measured` are the
 * only admissible sources for numbers about the world and need a citation.
 */
export const CLAIM_SOURCES = [
  'offer-truth',
  'entitlements',
  'feature',
  'external-cited',
  'measured',
] as const;
export type ClaimSource = (typeof CLAIM_SOURCES)[number];
