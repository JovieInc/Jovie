import { z } from 'zod';
import {
  CLAIM_KINDS,
  CLAIM_SOURCES,
  type ClaimSource,
  FEATURE_ACCESS_STATES,
  FEATURE_AUDIENCE_SCOPES,
  FEATURE_MATURITY_STATES,
  PUBLICATION_PERMISSIONS,
} from './registry.constants';

/**
 * Validation schemas for the product-truth registry (JOV-6223). Kept out of
 * registry.ts so public pages that read the registry never load zod; tests and
 * the factory truth sync import these directly.
 */
export const CapabilityMarketingProjectionSchema = z.strictObject({
  audience: z.enum(FEATURE_AUDIENCE_SCOPES),
  offerId: z.string().min(1).optional(),
  supportedJobs: z.array(z.string().min(1)).min(1),
  proofAuthorized: z.boolean(),
  contentRevision: z.iso.date(),
  accessLabel: z.string().min(1).optional(),
});

export const CapabilitySchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    maturity: z.enum(FEATURE_MATURITY_STATES),
    publication: z.enum(PUBLICATION_PERMISSIONS),
    access: z.enum(FEATURE_ACCESS_STATES),
    entitlementKeys: z.array(z.string().min(1)),
    flagKey: z.string().min(1).optional(),
    evidence: z.strictObject({
      captureScenarios: z.array(z.string().min(1)),
      routes: z.array(z.string().startsWith('/')),
    }),
    marketing: CapabilityMarketingProjectionSchema.optional(),
  })
  .superRefine((capability, ctx) => {
    if (
      capability.maturity === 'proposed' &&
      (capability.access === 'open' || capability.access === 'enrolled')
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'a proposed capability cannot grant access',
        path: ['access'],
      });
    }
    if (
      capability.marketing &&
      capability.publication !== 'internal_only' &&
      (capability.access === 'unavailable' ||
        capability.access === 'interest_capture') &&
      !capability.marketing.accessLabel
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'a published capability without access needs an honest accessLabel',
        path: ['marketing', 'accessLabel'],
      });
    }
  });
export type Capability = z.infer<typeof CapabilitySchema>;

const EVIDENCED_CLAIM_SOURCES: readonly ClaimSource[] = [
  'external-cited',
  'measured',
];

export const ClaimSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u),
    capabilityId: z.string().min(1),
    statement: z.string().trim().min(1),
    kind: z.enum(CLAIM_KINDS),
    source: z.enum(CLAIM_SOURCES),
    citation: z.string().trim().min(1).optional(),
    validUntil: z.iso.date().optional(),
  })
  .superRefine((claim, ctx) => {
    const evidenced = EVIDENCED_CLAIM_SOURCES.includes(claim.source);
    // Metrics and comparisons describe the world, not our code. They are
    // admissible only with measured or externally cited evidence that expires.
    if (claim.kind === 'metric' || claim.kind === 'comparison') {
      if (!evidenced) {
        ctx.addIssue({
          code: 'custom',
          message: `${claim.kind} claims need a measured or external-cited source`,
          path: ['source'],
        });
      }
      if (!claim.validUntil) {
        ctx.addIssue({
          code: 'custom',
          message: `${claim.kind} claims need a validUntil date`,
          path: ['validUntil'],
        });
      }
    }
    if (evidenced && !claim.citation) {
      ctx.addIssue({
        code: 'custom',
        message: `${claim.source} claims need a citation`,
        path: ['citation'],
      });
    }
    if (claim.kind === 'offer' && claim.source !== 'offer-truth') {
      ctx.addIssue({
        code: 'custom',
        message: 'offer claims must derive from lib/billing/offer-truth.ts',
        path: ['source'],
      });
    }
  });
export type Claim = z.infer<typeof ClaimSchema>;
