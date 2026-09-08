import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { GROWTH_LEARNING_SCHEMA } from '../invariants/growth-learning-policy.mjs';
import {
  DEFAULT_AUDIT_PATH,
  GROWTH_LEARNING_INTAKE_SCHEMA,
  GROWTH_LEARNING_SOURCE_REVISION_DIGEST_ALGORITHM,
  loadStewardshipAudit,
  projectStewardshipAudit,
  validateStewardshipAudit,
} from './audit.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function candidate(overrides) {
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

const FIXTURE_NOW = new Date('2026-01-05T00:00:00.000Z');

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

function fixedGrowthLearningIntake() {
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
    period: '2026-W01',
    sourceDigest,
    sourceRevisionDigestAlgorithm:
      GROWTH_LEARNING_SOURCE_REVISION_DIGEST_ALGORITHM,
    sourceRevisionDigest,
    dedupeKey: `growth-learning:2026-W01:${sourceRevisionDigest}`,
    maxSources: 5,
    maxProposals: 1,
    noDuplicateScheduler: true,
    priorDedupeKeys: [],
    records: [record],
  };
}

function coreAudit() {
  const audit = clone(loadStewardshipAudit());
  delete audit.growthLearningIntake;
  return audit;
}

function growthAudit() {
  const audit = coreAudit();
  audit.growthLearningIntake = fixedGrowthLearningIntake();
  return audit;
}

function growthLearningIntake() {
  const intake = fixedGrowthLearningIntake();
  assert.equal(intake.schemaVersion, GROWTH_LEARNING_INTAKE_SCHEMA);
  assert.equal(intake.records[0].schemaVersion, GROWTH_LEARNING_SCHEMA);
  return intake;
}

test('current-week artifact validates against the current clock', () => {
  const audit = loadStewardshipAudit();
  const result = validateStewardshipAudit(audit, { now: new Date() });
  assert.equal(result.ok, true);
  assert.equal(result.growthLearning.status, 'validated');
  assert.equal(result.growthLearning.records, 1);
  assert.equal(
    result.growthLearning.results[0]?.nextAction,
    'hold-for-founder-authorization'
  );
  assert.match(
    result.growthLearning.dedupeKey,
    /^growth-learning:\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3]):sha256:[a-f0-9]{64}$/
  );
});

test('current-week audit records source, date, authority, and lifecycle', () => {
  const audit = coreAudit();
  const result = validateStewardshipAudit(audit, { now: FIXTURE_NOW });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.ok(audit.candidates.length >= 27);
  for (const item of audit.candidates) {
    assert.equal(typeof item.source.kind, 'string');
    assert.equal(typeof item.source.ref, 'string');
    assert.match(item.source.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof item.authorityStatus, 'string');
    assert.equal(typeof item.lifecycle, 'string');
    assert.ok(item.provenance.length > 0);
  }
  const projection = projectStewardshipAudit(audit, result);
  assert.equal(projection.summary.founderDecisions, 0);
  assert.equal(
    projection.summary.actionableExceptions,
    projection.actionableExceptions.length
  );
  assert.ok(projection.actionableExceptions.every(item => item.owner));
  assert.equal('candidates' in projection, false);
  assert.ok(
    projection.actionableExceptions.every(item => item.kind !== 'approved')
  );
});

test('deliberate red: an undeclared semantic contradiction fails closed', () => {
  const audit = coreAudit();
  const original = audit.candidates.find(item => item.id === 'P04-precedence');
  audit.candidates.push({
    ...original,
    id: 'RED-recent-always-wins',
    statement: 'The most recent text always wins, regardless of correctness.',
    semanticValue: 'recency-only',
    source: {
      kind: 'test',
      ref: 'test:deliberate-red',
      date: '2026-08-23',
    },
    provenance: ['test:deliberate-red'],
  });
  const result = validateStewardshipAudit(audit);
  assert.equal(result.ok, false);
  assert.match(
    result.errors.join('\n'),
    /conflict:P04-precedence:RED-recent-always-wins/
  );
  assert.equal(
    result.findings.some(item => item.kind === 'conflicting'),
    true
  );
});

test('deliberate red: an approved orphan consumer fails closed', () => {
  const audit = coreAudit();
  const item = audit.candidates.find(
    candidateItem => candidateItem.id === 'P07-positive-negative-proof'
  );
  item.consumers = [];
  const result = validateStewardshipAudit(audit);
  assert.equal(result.ok, false);
  assert.match(
    result.errors.join('\n'),
    /missing-consumer:P07-positive-negative-proof/
  );
});

test('semantic validation identifies duplicates, overlaps, conflicts, and supersession', () => {
  const audit = coreAudit();
  const base = candidate({
    id: 'RED-left',
    semanticKey: 'overlap.key',
    semanticValue: 'same',
    scope: ['shared'],
  });
  audit.candidates.push(
    base,
    candidate({
      id: 'RED-duplicate',
      semanticKey: 'overlap.key',
      semanticValue: 'same',
      scope: ['shared'],
    }),
    candidate({
      id: 'RED-conflict',
      semanticKey: 'overlap.key',
      semanticValue: 'other',
      scope: ['shared'],
    }),
    candidate({
      id: 'RED-old',
      semanticKey: 'supersede.key',
      semanticValue: 'old',
      scope: ['history'],
      classification: 'approved',
      authorityStatus: 'approved',
    }),
    candidate({
      id: 'RED-new',
      semanticKey: 'supersede.key',
      semanticValue: 'new',
      scope: ['history'],
      relations: {
        overlaps: [],
        conflicts: [],
        supersedes: ['RED-old'],
        scopeSeparated: [],
      },
    })
  );
  const result = validateStewardshipAudit(audit);
  const kinds = new Set(result.findings.map(item => item.kind));
  assert.equal(kinds.has('duplicate'), true);
  assert.equal(kinds.has('conflicting'), true);
  assert.equal(kinds.has('supersession'), true);
  assert.match(result.errors.join('\n'), /duplicate:RED-duplicate:RED-left/);
  assert.match(result.errors.join('\n'), /conflict:RED-conflict:RED-left/);
  assert.match(result.errors.join('\n'), /supersession:RED-new:RED-old/);
});

test('unknown authority and dangling supersession fail visible', () => {
  const audit = coreAudit();
  audit.candidates.push(
    candidate({
      id: 'RED-unknown',
      classification: 'unknown',
      authorityStatus: 'unknown',
      consumers: [],
      tests: [],
    }),
    candidate({
      id: 'RED-dangling',
      relations: {
        overlaps: [],
        conflicts: [],
        supersedes: ['does-not-exist'],
        scopeSeparated: [],
      },
    })
  );
  const result = validateStewardshipAudit(audit);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /unknown-authority:RED-unknown/);
  assert.match(result.errors.join('\n'), /supersedes unknown does-not-exist/);
});

test('scope-separated stewardship and coding admission policies are compatible', () => {
  const audit = coreAudit();
  const result = validateStewardshipAudit(audit, { now: FIXTURE_NOW });
  assert.equal(
    result.findings.some(item => item.kind === 'conflicting'),
    false
  );
  const wip = audit.candidates.find(
    item => item.id === 'OPS-stewardship-wip-one'
  );
  const capacity = audit.candidates.find(
    item => item.id === 'OPS-symphony-measured-capacity'
  );
  assert.ok(wip.relations.scopeSeparated.includes(capacity.id));
  assert.ok(capacity.relations.scopeSeparated.includes(wip.id));
});

test('cadence composes the existing workflow and does not create another scheduler', () => {
  const workflow = fs.readFileSync(
    '.github/workflows/design-governance.yml',
    'utf8'
  );
  assert.match(workflow, /repository_dispatch:/);
  assert.match(workflow, /founder-decision-recorded/);
  assert.match(workflow, /invariant-enforcement-failed/);
  assert.match(workflow, /scripts\/invariants\/\*\*/);
  assert.match(workflow, /node scripts\/invariant-stewardship\/audit\.mjs/);
  assert.equal(
    fs.existsSync('.github/workflows/invariant-stewardship.yml'),
    false
  );
  assert.match(workflow, /group: governance-/);
  assert.match(workflow, /cron: '17 8 \* \* 1'/);
});

test('generated audit artifact remains evidence-only beside executable authority', () => {
  const audit = JSON.parse(fs.readFileSync(DEFAULT_AUDIT_PATH, 'utf8'));
  assert.equal(audit.authority, 'evidence-only');
  assert.equal(audit.canonicalRegistry.path, 'canon/invariants.jsonl');
  assert.equal(audit.canonicalRegistry.owner, 'JOV-5306');
  const personal = audit.sources.find(
    source => source.kind === 'personal-communications'
  );
  assert.equal(personal.status, 'excluded');
  const tasks = audit.sources.find(
    source => source.kind === 'codex-task-history'
  );
  assert.equal(tasks.status, 'partial');
  assert.equal(audit.growthLearningIntake.authority, 'evidence-only');
  assert.equal(audit.growthLearningIntake.records.length, 1);
});

test('weekly stewardship caller validates the bounded growth intake receipt', () => {
  const audit = growthAudit();
  audit.growthLearningIntake = growthLearningIntake();

  const result = validateStewardshipAudit(audit, { now: FIXTURE_NOW });
  assert.equal(result.ok, true);
  assert.deepEqual(result.growthLearning.errors, []);
  assert.equal(result.growthLearning.status, 'validated');
  assert.equal(result.growthLearning.records, 1);
  assert.equal(result.growthLearning.results[0].eligible, true);
  assert.equal(
    result.growthLearning.results[0].causalCertification,
    'not-certified'
  );

  const projection = projectStewardshipAudit(audit, result);
  assert.equal(projection.summary.growthLearningRecords, 1);
  assert.equal(projection.growthLearning.status, 'validated');
  assert.equal(
    projection.growthLearning.results[0].nextAction,
    'hold-for-founder-authorization'
  );
});

test('weekly stewardship caller preserves existing authority for internal measurement', () => {
  const audit = growthAudit();
  const intake = growthLearningIntake();
  intake.records[0].proposal = {
    ...intake.records[0].proposal,
    authorizationScope: 'existing-authority',
    executionAuthority: 'existing-authority',
    externalActions: ['measurement-only'],
  };
  audit.growthLearningIntake = intake;

  const result = validateStewardshipAudit(audit, { now: FIXTURE_NOW });
  assert.equal(result.ok, true);
  assert.equal(
    result.growthLearning.results[0].nextAction,
    'proceed-under-existing-authority'
  );
});

test('weekly stewardship caller rejects authority escalation and duplicate intake', () => {
  const audit = growthAudit();
  const intake = growthLearningIntake();
  intake.priorDedupeKeys = [intake.dedupeKey];
  intake.records[0].proposal = {
    ...intake.records[0].proposal,
    executionAuthority: 'self-authorized',
    externalActions: ['send-outreach'],
  };
  audit.growthLearningIntake = intake;

  const baseline = validateStewardshipAudit(coreAudit(), { now: FIXTURE_NOW });
  const result = validateStewardshipAudit(audit, { now: FIXTURE_NOW });
  assert.equal(result.ok, false);
  assert.equal(result.growthLearning.status, 'invalid');
  assert.deepEqual(result.findings, baseline.findings);
  assert.match(
    result.errors.join('\n'),
    /JOV-INV-028: growth-learning-duplicate-dedupe-key/
  );
  assert.match(
    result.errors.join('\n'),
    /JOV-INV-028: growth-learning-record-rejected:fixed-growth-learning/
  );
  assert.match(result.errors.join('\n'), /authority-escalation/);
  assert.match(result.errors.join('\n'), /forbidden-authority:send-outreach/);

  const projection = projectStewardshipAudit(audit, result);
  assert.equal(projection.growthLearning.status, 'invalid');
  assert.equal(projection.growthLearning.results[0].eligible, false);
  assert.equal(
    projection.summary.actionableExceptions,
    baseline.findings.length
  );

  const tamperedAudit = growthAudit();
  const tamperedDigest = `sha256:${'0'.repeat(64)}`;
  tamperedAudit.growthLearningIntake.sourceRevisionDigest = tamperedDigest;
  tamperedAudit.growthLearningIntake.dedupeKey = `growth-learning:2026-W01:${tamperedDigest}`;
  const tampered = validateStewardshipAudit(tamperedAudit, {
    now: FIXTURE_NOW,
  });
  assert.equal(tampered.ok, false);
  assert.match(
    tampered.errors.join('\n'),
    /growth-learning-source-revision-digest-mismatch/
  );

  const expiredAudit = growthAudit();
  const expired = validateStewardshipAudit(expiredAudit, {
    now: new Date('2026-02-01T00:00:00.000Z'),
  });
  assert.equal(expired.ok, false);
  assert.deepEqual(expired.findings, baseline.findings);
  assert.match(expired.errors.join('\n'), /proposal-expired/);
});
