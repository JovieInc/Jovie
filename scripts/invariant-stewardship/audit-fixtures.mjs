import { GROWTH_LEARNING_SCHEMA } from '../invariants/growth-learning-policy.mjs';
import {
  GROWTH_LEARNING_INTAKE_SCHEMA,
  GROWTH_LEARNING_SOURCE_REVISION_DIGEST_ALGORITHM,
  growthLearningEventDedupeKey,
} from './audit.mjs';

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function candidate(overrides) {
  return {
    id: 'TEST',
    statement: 'Test invariant.',
    semanticKey: 'test.key',
    semanticValue: 'test-value',
    scope: ['test-surface'],
    owner: 'summer',
    classification: 'approved',
    authorityStatus: 'approved',
    implementationAuthority: 'none',
    source: { kind: 'test', ref: 'test:deliberate-red', date: '2026-08-22' },
    provenance: ['test:deliberate-red'],
    consumers: [{ name: 'consumer', path: 'scripts', status: 'active' }],
    tests: [
      {
        name: 'deliberate red',
        path: 'scripts/invariant-stewardship/audit.test.mjs',
        kind: 'deliberate-red',
        status: 'active',
      },
    ],
    relations: {
      overlaps: [],
      conflicts: [],
      supersedes: [],
      scopeSeparated: [],
    },
    lifecycle: 'active',
    ...overrides,
  };
}

export const FIXTURE_NOW = new Date('2026-01-05T00:00:00.000Z');
export const CURRENT_ARTIFACT_NOW = new Date('2026-09-09T00:00:00.000Z');

function fixedGrowthSource(id, ref, sourceRevision) {
  return {
    id,
    ref,
    title: `Fixed ${id}`,
    kind: 'internal-test-source',
    publishedAt: null,
    publishedAtKnown: false,
    publishedAtPrecision: 'unknown',
    accessedAt: '2026-01-04T00:00:00.000Z',
    sourceRevision,
    provenance: 'fixed test fixture',
    incentiveOrBias: 'Fixed test evidence is not customer evidence.',
    observedFacts: ['The fixed source provides bounded test evidence.'],
    inferences: ['The fixed source supports a measured policy test.'],
    freshness: {
      status: 'current',
      checkedAt: '2026-01-04T00:00:00.000Z',
      ttlDays: 30,
    },
    status: 'active',
    duplicateOf: null,
  };
}

export function fixedGrowthLearningIntake() {
  const sourceDigest = `sha256:${'a'.repeat(64)}`;
  const sourceRevisionDigest =
    'sha256:db78761ac11460e636a4932650c9d358962bf587e0414ed932000f7327a44c67';
  const record = {
    schemaVersion: GROWTH_LEARNING_SCHEMA,
    id: 'fixed-growth-learning',
    phase: 'propose',
    assessedAt: '2026-01-04T00:00:00.000Z',
    sourceDigest,
    sources: [
      fixedGrowthSource(
        'fixed-source-a',
        'repo:test/source-a',
        'fixed-source-a:v1'
      ),
      fixedGrowthSource(
        'fixed-source-b',
        'repo:test/source-b',
        'fixed-source-b:v1'
      ),
    ],
    claim: {
      evidenceClass: 'mixed-source-study',
      causalStatus: 'unproven',
      causalCertification: 'not-certified',
      measurementVerified: false,
      observedFacts: ['The fixed sources support a bounded policy test.'],
      inferences: ['A bounded test can measure downstream product value.'],
      counterevidence: ['The fixture does not establish customer demand.'],
    },
    fit: {
      product: 'Jovie',
      audience: 'Independent creators with a verified product-fit signal.',
      painSignal:
        'A public product-fit signal corroborated by a second source.',
      decision: 'fit-hypothesis',
      evidenceRefs: ['fixed-source-a', 'fixed-source-b'],
      disqualifiers: ['No verified product-fit signal.'],
    },
    proposal: {
      status: 'proposed',
      hypothesis: 'A bounded preview may increase qualified activation.',
      sourceSignal: 'A fixed public product-fit signal.',
      audienceRule: 'Eligible creator accounts with a corroborated signal.',
      comparator: 'A 50% no-contact holdout.',
      cohortProtocol: {
        qualifiedCohortFrozenAt: '2026-01-02T00:00:00.000Z',
        assignmentAt: '2026-01-03T00:00:00.000Z',
        allocation: {
          method: 'reproducible-account-level-randomization',
          seedRef: 'growth-learning:2026-W01',
        },
      },
      signalTiming: {
        announcementAt: '2026-01-02T00:00:00.000Z',
        eventAt: '2026-01-04T00:00:00.000Z',
      },
      outcomeObservation: {
        bothArmsObservable: true,
        matchMethod: 'fixed-account-level-event-join',
        holdoutContacted: false,
        missingnessReportedByArm: true,
        unknownOutcomesAreMissing: true,
      },
      owner: 'Summer',
      authorizationOwner: 'Founder',
      authorizationScope: 'external-consequential',
      executionAuthority: 'pending-founder-authorization',
      externalActions: ['prepare-only'],
      effortCap: { amount: 1, unit: 'hours' },
      spendCap: { amount: 0, unit: 'USD' },
      primaryMetric: {
        name: 'qualified activation rate',
        numerator: 'Assigned creator accounts reaching qualified activation.',
        denominator: 'All assigned eligible creator accounts.',
        windowDays: 14,
      },
      negativeMetrics: ['complaint rate'],
      minimumDetectableEffect: {
        metric: 'qualified activation rate',
        absolute: 0.15,
      },
      sampleSize: {
        treatment: 2,
        control: 2,
        unit: 'eligible creator account',
        designIntent: 'exploratory-pilot',
        powerStatus: 'not-powered',
      },
      stopRules: ['Stop on unauthorized external contact.'],
      dataBoundary: ['Public sources only.'],
      expiresAt: '2026-02-01T00:00:00.000Z',
      outcomeReviewAt: '2026-11-18T00:00:00.000Z',
      rollback:
        'Withdraw the prepared preview without changing product policy.',
      decisionWriteback: 'Write the measured result to the fixed test receipt.',
    },
    amendment: {
      status: 'none',
      scope: [],
      sourceRevision: null,
      measuredOutcome: { state: 'not-run' },
      compatibilityCheck: 'not-run',
      conflictCheck: 'not-run',
      conflictsWith: [],
      rollback: '',
      reviewAt: null,
    },
  };
  return {
    schemaVersion: GROWTH_LEARNING_INTAKE_SCHEMA,
    authority: 'evidence-only',
    causalEvent: {
      id: 'work-result:fixed-growth-learning',
      kind: 'terminal-result',
      sourceRevision: 'fixed-result:v1',
    },
    sourceDigest,
    sourceRevisionDigestAlgorithm:
      GROWTH_LEARNING_SOURCE_REVISION_DIGEST_ALGORITHM,
    sourceRevisionDigest,
    dedupeKey: growthLearningEventDedupeKey(
      {
        id: 'work-result:fixed-growth-learning',
        kind: 'terminal-result',
        sourceRevision: 'fixed-result:v1',
      },
      sourceRevisionDigest
    ),
    maxSources: 5,
    maxProposals: 1,
    noDuplicateScheduler: true,
    priorDedupeKeys: [],
    records: [record],
  };
}
