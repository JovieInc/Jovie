import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { regenerateStewardshipAudit } from '../../apps/web/lib/ovie/invariant-stewardship.js';
import {
  CURRENT_ARTIFACT_NOW,
  candidate,
  clone,
  FIXTURE_NOW,
  fixedGrowthLearningIntake,
} from './audit-fixtures.mjs';
import './__tests__/source-binding.cases.mjs';
import { GROWTH_LEARNING_SCHEMA } from '../invariants/growth-learning-policy.mjs';
import {
  DEFAULT_AUDIT_PATH,
  GROWTH_LEARNING_INTAKE_SCHEMA,
  growthLearningEventDedupeKey,
  loadCanonicalSource,
  loadStewardshipAudit,
  projectStewardshipAudit,
  validateGrowthLearningIntake,
  validateStewardshipAudit,
} from './audit.mjs';

function coreAudit() {
  const audit = clone(loadStewardshipAudit());
  delete audit.growthLearningIntake;
  return audit;
}

function sourceBoundAudit() {
  return regenerateStewardshipAudit(loadCanonicalSource(), {
    generatedAt: FIXTURE_NOW.toISOString(),
    causalEvent: {
      kind: 'source-change',
      id: 'canonical-invariants:test-fixture',
      sourceRevision: 'canonical-invariants:test-fixture:v1',
    },
  });
}

function growthAudit() {
  return {
    ...sourceBoundAudit(),
    growthLearningIntake: fixedGrowthLearningIntake(),
  };
}

function growthLearningIntake() {
  const intake = fixedGrowthLearningIntake();
  assert.equal(intake.schemaVersion, GROWTH_LEARNING_INTAKE_SCHEMA);
  assert.equal(intake.records[0].schemaVersion, GROWTH_LEARNING_SCHEMA);
  return intake;
}

test('historical weekly artifact remains readable without admission or live reevaluation', () => {
  const audit = loadStewardshipAudit();
  const result = validateStewardshipAudit(audit, {
    now: CURRENT_ARTIFACT_NOW,
  });
  assert.equal(result.ok, false);
  assert.equal(result.shapeValid, true);
  assert.equal(result.evidence.state, 'historical');
  assert.deepEqual(result.findings, []);
  assert.equal(result.growthLearning.status, 'historical');
  assert.equal(result.growthLearning.records, 1);
  assert.equal(result.growthLearning.results[0]?.nextAction, 'historical-only');
  assert.equal(result.growthLearning.admissionEligible, false);
  assert.equal(result.growthLearning.results[0]?.eligible, false);
  const later = validateStewardshipAudit(audit, {
    now: new Date('2027-01-01'),
  });
  assert.deepEqual(later.growthLearning, result.growthLearning);
  assert.deepEqual(
    audit.growthLearningIntake.records[0].sources.map(source => source.id),
    [
      'yc-growth-learning',
      'product-canon',
      'vercel-open-source-program-spring-2026',
      'vercel-labs-agent-browser-v0-37-1',
      'vercel-sandbox-agent-architecture',
    ]
  );
  assert.equal(
    audit.growthLearningIntake.records[0].sources.some(
      source => source.id === 'guillermo-rauch-public-posts'
    ),
    false
  );
  assert.equal(
    result.growthLearning.dedupeKey,
    'growth-learning:2026-W36:sha256:3d9c198c314db3ad230729b72a8326d5113d54341b7ab6d55492b0f209714f2b'
  );
  assert.match(
    result.growthLearning.dedupeKey,
    /^growth-learning:\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3]):sha256:[a-f0-9]{64}$/
  );
});

test('historical audit retains source, date, authority, and lifecycle without current actions', () => {
  const audit = coreAudit();
  const result = validateStewardshipAudit(audit, { now: CURRENT_ARTIFACT_NOW });
  assert.equal(result.ok, false);
  assert.equal(result.shapeValid, true);
  assert.equal(result.evidence.state, 'historical');
  assert.ok(result.errors.length > 0);
  assert.deepEqual(result.findings, []);
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
  assert.equal(projection.summary.actionableExceptions, 0);
  assert.deepEqual(projection.actionableExceptions, []);
  assert.deepEqual(projection.summerQueue, []);
  assert.ok(result.historicalFindings.length > 0);
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
    result.historicalFindings.some(item => item.kind === 'conflicting'),
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

test('historical semantic lint identifies duplicates, overlaps, conflicts, and supersession', () => {
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
  const kinds = new Set(result.historicalFindings.map(item => item.kind));
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
    result.historicalFindings.some(item => item.kind === 'conflicting'),
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

test('stewardship composes the existing event-driven workflow and adds no scheduler', () => {
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
  assert.doesNotMatch(workflow, /^\s+schedule:/m);
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

test('event-driven stewardship caller validates the bounded growth intake receipt', () => {
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

test('event-driven stewardship caller preserves existing authority for internal measurement', () => {
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

test('event-driven stewardship caller rejects authority escalation and duplicate intake', () => {
  const audit = growthAudit();
  const intake = growthLearningIntake();
  intake.priorDedupeKeys = [intake.dedupeKey];
  intake.records[0].proposal = {
    ...intake.records[0].proposal,
    executionAuthority: 'self-authorized',
    externalActions: ['send-outreach'],
  };
  audit.growthLearningIntake = intake;

  const baseline = validateStewardshipAudit(sourceBoundAudit(), {
    now: FIXTURE_NOW,
  });
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
  tamperedAudit.growthLearningIntake.dedupeKey = growthLearningEventDedupeKey(
    tamperedAudit.growthLearningIntake.causalEvent,
    tamperedDigest
  );
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

test('causal events reach bounded validation; clocks and missing event identity cannot admit', () => {
  for (const kind of [
    'terminal-result',
    'exception',
    'evidence-threshold-crossed',
    'pending-job',
  ]) {
    const intake = fixedGrowthLearningIntake();
    intake.causalEvent.kind = kind;
    intake.dedupeKey = growthLearningEventDedupeKey(
      intake.causalEvent,
      intake.sourceRevisionDigest
    );
    const result = validateGrowthLearningIntake(intake, { now: FIXTURE_NOW });
    assert.equal(result.status, 'validated', kind);
    assert.equal(result.admissionEligible, true, kind);
    assert.equal(result.results.length, 1, kind);
  }
  const intake = fixedGrowthLearningIntake();
  const scheduled = validateGrowthLearningIntake(intake, {
    now: FIXTURE_NOW,
    eventName: 'schedule',
  });
  assert.equal(scheduled.admissionEligible, false);
  assert.deepEqual(scheduled.results, []);
  assert.deepEqual(scheduled.errors, [
    'growth-learning-scheduled-intake-retired',
  ]);
  for (const causalEvent of [
    undefined,
    {},
    { ...intake.causalEvent, kind: 'schedule' },
    { ...intake.causalEvent, sourceRevision: '' },
  ]) {
    const invalid = validateGrowthLearningIntake(
      { ...intake, causalEvent },
      { now: FIXTURE_NOW }
    );
    assert.equal(invalid.status, 'invalid');
    assert.equal(invalid.admissionEligible, false);
    assert.ok(invalid.errors.includes('growth-learning-causal-event-invalid'));
  }
  const weekly = validateGrowthLearningIntake(
    { ...intake, period: '2026-W02' },
    { now: FIXTURE_NOW }
  );
  assert.equal(weekly.admissionEligible, false);
  assert.ok(weekly.errors.includes('growth-learning-period-retired'));
});

test('event dedupe survives week rollover and historical keys while revisions reopen identity', () => {
  const intake = fixedGrowthLearningIntake();
  const original = intake.dedupeKey;
  intake.priorDedupeKeys = [
    loadStewardshipAudit().growthLearningIntake.dedupeKey,
  ];
  assert.equal(
    validateGrowthLearningIntake(intake, { now: FIXTURE_NOW }).status,
    'validated'
  );
  intake.priorDedupeKeys.push(original);
  for (const now of [FIXTURE_NOW, new Date('2026-01-12T00:00:00Z')]) {
    const duplicate = validateGrowthLearningIntake(intake, { now });
    assert.equal(duplicate.admissionEligible, false);
    assert.ok(
      duplicate.errors.includes(
        `growth-learning-duplicate-dedupe-key:${original}`
      )
    );
  }
  intake.causalEvent.sourceRevision = 'fixed-result:v2';
  intake.dedupeKey = growthLearningEventDedupeKey(
    intake.causalEvent,
    intake.sourceRevisionDigest
  );
  assert.notEqual(intake.dedupeKey, original);
  assert.equal(
    validateGrowthLearningIntake(intake, { now: FIXTURE_NOW }).status,
    'validated'
  );
  assert.notEqual(
    growthLearningEventDedupeKey(
      intake.causalEvent,
      `sha256:${'b'.repeat(64)}`
    ),
    intake.dedupeKey
  );
});

test('malformed historical relations stay invalid without throwing or creating current work', () => {
  const audit = coreAudit();
  audit.candidates[0].relations = {
    overlaps: [],
    conflicts: [],
    supersedes: [],
    scopeSeparated: null,
  };
  const result = validateStewardshipAudit(audit, { now: FIXTURE_NOW });
  assert.equal(result.ok, false);
  assert.equal(result.shapeValid, false);
  assert.match(result.errors.join('\n'), /relations/);
  assert.deepEqual(result.findings, []);
  const projection = projectStewardshipAudit(audit, result);
  assert.deepEqual(projection.summerQueue, []);
  assert.deepEqual(projection.founderQueue, []);
});

test('source-unbound historical stewardship cannot admit an otherwise valid causal growth receipt', () => {
  const audit = coreAudit();
  audit.generatedAt = FIXTURE_NOW.toISOString();
  audit.growthLearningIntake = growthLearningIntake();
  const standalone = validateGrowthLearningIntake(audit.growthLearningIntake, {
    now: FIXTURE_NOW,
  });
  assert.equal(standalone.admissionEligible, true);
  const result = validateStewardshipAudit(audit, { now: FIXTURE_NOW });
  assert.equal(result.ok, false);
  assert.equal(result.evidence.state, 'historical');
  assert.equal(result.growthLearning.admissionEligible, false);
  assert.equal(result.growthLearning.results[0].eligible, false);
  assert.equal(
    result.growthLearning.results[0].nextAction,
    'verify-stewardship-source'
  );
  const projection = projectStewardshipAudit(audit, result);
  assert.equal(projection.growthLearning.admissionEligible, false);
  assert.deepEqual(projection.summerQueue, []);
  assert.deepEqual(projection.founderQueue, []);
});

// The outer reader must preserve the evaluator's clock, including its fail-closed state.
test('audit projection preserves the injected future-evidence rejection', () => {
  const audit = sourceBoundAudit();
  const validation = validateStewardshipAudit(audit, {
    now: new Date('2026-01-04T00:00:00Z'),
  });
  assert.equal(validation.evidence.state, 'invalid');
  const projection = projectStewardshipAudit(audit, validation);
  assert.equal(projection.evidence.state, 'invalid');
  assert.deepEqual(projection.summerQueue, []);
});

test('malformed historical sources and proof arrays remain diagnostics', () => {
  for (const mutate of [
    audit => {
      audit.sources = [null];
    },
    audit => {
      audit.candidates[0].consumers = {};
    },
    audit => {
      audit.candidates[0].tests = [null];
    },
    audit => {
      audit.candidates[0].scope = 'invalid';
    },
  ]) {
    const audit = coreAudit();
    mutate(audit);
    const validation = validateStewardshipAudit(audit);
    assert.equal(validation.ok, false);
    assert.deepEqual(validation.findings, []);
    assert.deepEqual(
      projectStewardshipAudit(audit, validation).summerQueue,
      []
    );
  }
});
