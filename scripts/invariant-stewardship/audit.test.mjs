import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { GROWTH_LEARNING_SCHEMA } from '../invariants/growth-learning-policy.mjs';
import {
  DEFAULT_AUDIT_PATH,
  GROWTH_LEARNING_INTAKE_SCHEMA,
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

const GROWTH_NOW = new Date('2026-09-07T00:00:00.000Z');

function growthLearningIntake() {
  const intake = clone(loadStewardshipAudit().growthLearningIntake);
  assert.equal(intake.schemaVersion, GROWTH_LEARNING_INTAKE_SCHEMA);
  assert.equal(intake.records[0].schemaVersion, GROWTH_LEARNING_SCHEMA);
  return intake;
}

test('current-week audit records source, date, authority, and lifecycle', () => {
  const audit = loadStewardshipAudit();
  const result = validateStewardshipAudit(audit, { now: GROWTH_NOW });
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
  assert.equal(projection.growthLearning.status, 'validated');
  assert.equal(projection.summary.growthLearningRecords, 1);
  assert.equal(
    projection.growthLearning.dedupeKey,
    'growth-learning:2026-W36:sha256:cee5dbfd608ac62bedddfba151a689ebdb20c0aa8be32c25c409ea5ac9e4a9aa'
  );
  assert.equal(
    projection.growthLearning.results[0]?.nextAction,
    'hold-for-founder-authorization'
  );
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
  const audit = clone(loadStewardshipAudit());
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
  const audit = clone(loadStewardshipAudit());
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
  const audit = clone(loadStewardshipAudit());
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
  const audit = clone(loadStewardshipAudit());
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
  const audit = loadStewardshipAudit();
  const result = validateStewardshipAudit(audit);
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
  const audit = clone(loadStewardshipAudit());
  audit.growthLearningIntake = growthLearningIntake();

  const result = validateStewardshipAudit(audit, { now: GROWTH_NOW });
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
  const audit = clone(loadStewardshipAudit());
  const intake = growthLearningIntake();
  intake.records[0].proposal = {
    ...intake.records[0].proposal,
    authorizationScope: 'existing-authority',
    executionAuthority: 'existing-authority',
    externalActions: ['measurement-only'],
  };
  audit.growthLearningIntake = intake;

  const result = validateStewardshipAudit(audit, { now: GROWTH_NOW });
  assert.equal(result.ok, true);
  assert.equal(
    result.growthLearning.results[0].nextAction,
    'proceed-under-existing-authority'
  );
});

test('weekly stewardship caller rejects authority escalation and duplicate intake', () => {
  const audit = clone(loadStewardshipAudit());
  const intake = growthLearningIntake();
  intake.priorDedupeKeys = [intake.dedupeKey];
  intake.records[0].proposal = {
    ...intake.records[0].proposal,
    executionAuthority: 'self-authorized',
    externalActions: ['send-outreach'],
  };
  audit.growthLearningIntake = intake;

  const result = validateStewardshipAudit(audit, { now: GROWTH_NOW });
  assert.equal(result.ok, false);
  assert.equal(result.growthLearning.status, 'invalid');
  assert.equal(result.findings.length, 12);
  assert.match(
    result.errors.join('\n'),
    /JOV-INV-028: growth-learning-duplicate-dedupe-key/
  );
  assert.match(
    result.errors.join('\n'),
    /JOV-INV-028: growth-learning-record-rejected:growth-learning-2026-09-04-yc-signal-fit/
  );
  assert.match(result.errors.join('\n'), /authority-escalation/);
  assert.match(result.errors.join('\n'), /forbidden-authority:send-outreach/);

  const projection = projectStewardshipAudit(audit, result);
  assert.equal(projection.growthLearning.status, 'invalid');
  assert.equal(projection.growthLearning.results[0].eligible, false);
  assert.equal(projection.summary.actionableExceptions, 12);

  const expiredAudit = clone(loadStewardshipAudit());
  const expired = validateStewardshipAudit(expiredAudit, {
    now: new Date('2026-10-04T00:00:00.000Z'),
  });
  assert.equal(expired.ok, false);
  assert.equal(expired.findings.length, 12);
  assert.match(expired.errors.join('\n'), /proposal-expired/);
});
