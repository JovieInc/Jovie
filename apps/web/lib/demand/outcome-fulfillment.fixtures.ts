import type { CertificationRecordBackend } from '@/lib/agent-os/certification-cas';
import { governDemandAllocation } from './allocation-governor';
import { compilePresenceOutcome, supplierDigest } from './outcome-compiler';
import type {
  CapabilityDraft,
  CapabilitySupplier,
  CompileOutcomeCommand,
} from './outcome-contract';

// Synthetic source-owner receipts: these fixtures make no provider/runtime claim.
export const NOW = new Date('2026-11-16T10:10:00.000Z');
export const BEFORE = '2026-11-16T10:00:00.000Z';
export const AFTER = '2026-11-17T10:00:00.000Z';
const BUILD = 'a'.repeat(40);
export const scope = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  subjectId: '22222222-2222-4222-8222-222222222222',
};
export const otherScope = {
  ...scope,
  tenantId: '33333333-3333-4333-8333-333333333333',
};
export const primitive = {
  id: 'profile.bio',
  version: 1,
  kind: 'fact',
} as const;
export const metrics = {
  informationGain: 1,
  correctness: 1,
  coverage: 1,
  successfulActionRate: 1,
  falseMatchRate: 0,
  freshnessSeconds: 60,
  latencyMs: 50,
  fullyLoadedCostCents: 4,
};
type Certification = NonNullable<
  CompileOutcomeCommand['certifications']
>[number];
type Outcome = NonNullable<CompileOutcomeCommand['outcomes']>[number];

export function supplier(
  overrides: Partial<CapabilitySupplier> = {}
): CapabilitySupplier {
  return {
    scope,
    primitive,
    id: 'fixture:authorized-profile-source',
    version: 'adapter-v1',
    ownerRef: 'fixture:canonical-connector-owner',
    authority: 'read',
    route: 'connected_api',
    status: 'available',
    authorizationRef: 'fixture:tenant-account-read-consent',
    privacy: 'approved',
    terms: 'approved',
    policyRef: 'fixture:profile-read-policy-v1',
    reviewedAt: BEFORE,
    validUntil: AFTER,
    expected: metrics,
    trialCostCents: 1,
    ...overrides,
  };
}

export function certification(
  source = supplier(),
  overrides: Partial<Certification> = {}
): Certification {
  return {
    id: `certification:${source.primitive.id}`,
    scope: source.scope,
    primitive: source.primitive,
    supplierDigest: supplierDigest(source),
    ownerRef: source.ownerRef!,
    authority: source.authority!,
    buildSha: BUILD,
    verifiedAt: BEFORE,
    expiresAt: AFTER,
    verdict: 'pass',
    evidenceRefs: ['fixture:adapter-conformance'],
    tests: (
      [
        'tenant-isolation',
        'revocation',
        'replay',
        'failure-recovery',
        'unsupported',
      ] as const
    ).map(id => ({ id, status: 'pass', evidenceRef: `fixture:test:${id}` })),
    ...overrides,
  };
}

export function outcome(
  source = supplier(),
  overrides: Partial<Outcome> = {}
): Outcome {
  return {
    id: `outcome:${source.primitive.id}:1`,
    scope: source.scope,
    primitive: source.primitive,
    supplierDigest: supplierDigest(source),
    certificationId: certification(source).id,
    authority: source.authority!,
    buildSha: BUILD,
    jobId: `fixture:profile-current:${source.primitive.id}`,
    startedAt: '2026-11-16T10:05:00.000Z',
    completedAt: '2026-11-16T10:06:00.000Z',
    status: 'correct_completed',
    evidenceRefs: ['fixture:profile-observation'],
    realized: metrics,
    ...overrides,
  };
}

export function fact(
  source = supplier()
): CompileOutcomeCommand['facts'][number] {
  return {
    scope: source.scope,
    primitive: source.primitive,
    sourceRef: 'fixture:authorized-profile-api',
    supplierDigest: supplierDigest(source),
    evidenceRef: 'fixture:profile-observation',
    observedAt: '2026-11-16T10:06:00.000Z',
    validUntil: AFTER,
    state: 'known',
    reason: null,
    territory: null,
    match: 'verified',
  };
}

export function command(
  overrides: Partial<CompileOutcomeCommand> = {}
): CompileOutcomeCommand {
  return {
    op: 'compile_outcome',
    scope,
    outcome: 'presence.profile-current/v1',
    demand: [
      {
        id: 'fixture:demand:profile-current',
        observedAt: BEFORE,
        evidenceRef: 'fixture:authenticated-unmet-request',
        provenance: {
          kind: 'internal-synthetic',
          sourceKey: 'fixture:creator',
        },
      },
    ],
    facts: [],
    suppliers: [supplier()],
    trials: [],
    certifications: [],
    outcomes: [],
    budget: {
      maxTrialCostCents: 5,
      maxConcurrentTrials: 1,
      valuePerUsefulOutcomeCents: 100,
      minCorrectness: 0.95,
      maxFalseMatchRate: 0.05,
      minCoverage: 0.5,
      maxFreshnessSeconds: 86400,
      maxLatencyMs: 2000,
    },
    ...overrides,
  };
}

export function fulfilled(
  overrides: Partial<CompileOutcomeCommand> = {}
): CompileOutcomeCommand {
  return command({
    facts: [fact()],
    certifications: [certification()],
    outcomes: [outcome()],
    ...overrides,
  });
}

export function bio(
  input: CompileOutcomeCommand,
  previous?: CapabilityDraft[]
) {
  const prior = previous ?? compilePresenceOutcome(command(), NOW);
  return compilePresenceOutcome(input, NOW, prior).find(
    draft => draft.primitive.id === primitive.id
  )!;
}

export function harness() {
  const records = new Map<string, unknown>();
  const backend: CertificationRecordBackend = {
    get: async key => records.get(key) ?? null,
    setIfAbsent: async (key, value) => {
      if (records.has(key)) return false;
      records.set(key, value);
      return true;
    },
    compareAndSet: async (key, expected, next) => {
      if (records.get(key) !== expected) return false;
      records.set(key, next);
      return true;
    },
  };
  const send = (value: unknown) =>
    governDemandAllocation({
      backend,
      command: value,
      now: NOW,
      gate: {
        status: 'green',
        evaluatedAt: NOW.toISOString(),
        ref: 'fixture:shipping-capacity-green',
      },
    });
  return { records, backend, send };
}
