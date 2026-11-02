import { z } from 'zod';
import { ARTIST_PROFILE_FIELDS } from '@/lib/connectors/artist-profile-contract';

const ref = z.string().trim().min(1).max(1000);
const timestamp = z.string().datetime({ offset: true });
const count = z.number().finite().nonnegative();
const unit = count.max(1);
const scope = z.strictObject({ tenantId: z.uuid(), subjectId: z.uuid() });
const primitive = z.strictObject({
  id: ref,
  version: z.literal(1),
  kind: z.enum(['fact', 'action']),
});

/** Requirements precede suppliers. Action availability never grants permission to act. */
export const PRESENCE_CURRENT_CONTRACT = {
  id: 'presence.profile-current',
  version: 1,
  requirements: [
    { id: 'profile.authority', version: 1 as const, kind: 'fact' as const },
    ...ARTIST_PROFILE_FIELDS.map(field => ({
      id: `profile.${field}`,
      version: 1 as const,
      kind: 'fact' as const,
    })),
    { id: 'profile.correction', version: 1 as const, kind: 'action' as const },
    { id: 'profile.identity', version: 1 as const, kind: 'fact' as const },
  ].sort((a, b) => a.id.localeCompare(b.id)),
} as const;

export const sourceMetricsSchema = z.strictObject({
  informationGain: unit,
  correctness: unit,
  coverage: unit,
  successfulActionRate: unit.nullable(),
  falseMatchRate: unit,
  freshnessSeconds: count,
  latencyMs: count,
  /** Includes acquisition, integration, compute, maintenance and review. */
  fullyLoadedCostCents: count,
});
export const capabilitySupplierSchema = z.strictObject({
  scope,
  primitive,
  id: ref,
  version: ref,
  route: z.enum([
    'canonical',
    'connected_api',
    'authorized_portal',
    'first_party_public',
    'public_search',
    'reference_registry',
    'licensed_vendor',
    'research_agent',
    'custom_build',
  ]),
  status: z.enum(['candidate', 'available', 'revoked', 'retired']),
  authorizationRef: ref.nullable(),
  privacy: z.enum(['approved', 'denied', 'unknown']),
  terms: z.enum(['approved', 'denied', 'unknown']),
  policyRef: ref,
  reviewedAt: timestamp,
  validUntil: timestamp,
  expected: sourceMetricsSchema,
  trialCostCents: count,
});
const trial = z.strictObject({
  id: ref,
  supplierDigest: z.string().regex(/^[a-f0-9]{64}$/),
  startedAt: timestamp,
  completedAt: timestamp,
  evidenceRefs: z.array(ref).min(1).max(20),
  realized: sourceMetricsSchema,
});
const demand = z.strictObject({
  id: ref,
  observedAt: timestamp,
  evidenceRef: ref,
  provenance: z.strictObject({
    kind: z.enum([
      'external-customer',
      'external-organic',
      'founder',
      'internal-fleet',
      'internal-synthetic',
      'unknown',
    ]),
    sourceKey: ref,
  }),
});
const fact = z.strictObject({
  scope,
  primitive,
  sourceRef: ref,
  supplierDigest: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  evidenceRef: ref,
  observedAt: timestamp,
  validUntil: timestamp,
  state: z.enum([
    'known',
    'partial',
    'unknown',
    'unavailable',
    'blocked',
    'revoked',
  ]),
  reason: ref.nullable(),
  territory: ref.nullable(),
  match: z.enum(['verified', 'unverified']),
});
const budget = z.strictObject({
  maxTrialCostCents: count,
  maxConcurrentTrials: z.number().int().min(0).max(3),
  valuePerUsefulOutcomeCents: count,
  minCorrectness: unit,
  maxFalseMatchRate: unit,
  minCoverage: unit,
  maxFreshnessSeconds: count,
  maxLatencyMs: count,
});

/** Authenticated Summer supplies scoped evidence references, never restricted source text. */
export const compileOutcomeCommandSchema = z.strictObject({
  op: z.literal('compile_outcome'),
  scope,
  outcome: z.literal('presence.profile-current/v1'),
  demand: z.array(demand).min(1).max(100),
  facts: z.array(fact).max(100),
  suppliers: z.array(capabilitySupplierSchema).max(100),
  trials: z.array(trial).max(100),
  budget,
});
export const capabilityDraftSchema = z.strictObject({
  /** Snapshot time; recompile on source/policy changes or the next evidence review. */
  evaluatedAt: timestamp,
  scope,
  outcome: z.literal('presence.profile-current/v1'),
  primitive,
  enabled: z.literal(false),
  state: z.enum(['known', 'partial', 'unknown']),
  demand: z.array(demand).min(1).max(100),
  facts: z.array(fact).max(100),
  suppliers: z.array(capabilitySupplierSchema).max(100),
  trials: z.array(trial).max(100),
  budget,
  decision: z.strictObject({
    kind: z.enum(['reuse', 'trial', 'promote', 'no_action']),
    supplierDigest: z.string().nullable(),
    reason: ref,
  }),
});
export type CompileOutcomeCommand = z.infer<typeof compileOutcomeCommandSchema>;
export type CapabilityDraft = z.infer<typeof capabilityDraftSchema>;
export type CapabilitySupplier = z.infer<typeof capabilitySupplierSchema>;
