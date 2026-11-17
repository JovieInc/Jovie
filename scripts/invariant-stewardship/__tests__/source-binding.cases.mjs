import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  evaluateStewardshipSources as evaluateSources,
  projectStewardshipEvidence as projectEvidence,
  regenerateStewardshipAudit,
  SOURCE_BOUND_SCHEMA,
} from '../../../apps/web/lib/ovie/invariant-stewardship.js';

const NOW = new Date('2026-11-17T01:00:00.000Z');
const evaluateStewardshipSources = (audit, canon, options = { now: NOW }) =>
  evaluateSources(audit, canon, options);
const projectStewardshipEvidence = (audit, canon, options = { now: NOW }) =>
  projectEvidence(audit, canon, options);

const GENERATED_AT = '2026-11-17T00:00:00.000Z';
const EVENT = {
  kind: 'source-change',
  id: 'canon-change:fixture',
  sourceRevision: 'immutable-source-revision',
};

function invariant(id, overrides = {}) {
  return {
    id,
    title: `Invariant ${id}`,
    statement: 'One source owns this fact.',
    scope: { products: ['Jovie'], surfaces: ['test-surface'] },
    authority: { owner: 'Summer', approvedBy: 'Founder' },
    effective: { date: '2026-11-16', version: 1 },
    precedence: 1000,
    policy: { key: 'fixture.source', value: { mode: 'canonical' } },
    enforcementConsumers: [{ name: 'fixture', path: 'fixture.mjs' }],
    evidence: {
      tests: [{ name: 'fixture test', path: 'fixture.test.mjs' }],
      deliberateRed: [{ name: 'fixture red', path: 'fixture.test.mjs' }],
    },
    lifecycle: { state: 'adopted', supersedes: [], supersededBy: null },
    ...overrides,
  };
}

function source(...rows) {
  return (
    [
      {
        schema: 'jovie-invariant-registry/v1',
        version: 'fixture-v1',
        authority: { owner: 'Summer', approvedBy: 'Founder' },
      },
      ...rows,
    ]
      .map(row => JSON.stringify(row))
      .join('\n') + '\n'
  );
}

function regenerate(canonicalSource) {
  return regenerateStewardshipAudit(canonicalSource, {
    causalEvent: EVENT,
    generatedAt: GENERATED_AT,
  });
}

test('deliberate red: the checked-in August snapshot cannot be current evidence', () => {
  const historical = JSON.parse(
    readFileSync(
      new URL(
        '../../../apps/web/lib/ovie/generated/invariant-stewardship.current-week.json',
        import.meta.url
      ),
      'utf8'
    )
  );
  const canon = readFileSync(
    new URL('../../../canon/invariants.jsonl', import.meta.url),
    'utf8'
  );
  const result = evaluateStewardshipSources(historical, canon);
  assert.equal(result.state, 'historical');
  assert.equal(result.executionStatus, 'not-certified');
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.facts, []);
  assert.ok(result.source.digest.startsWith('sha256:'));
});

test('regeneration creates verified source facts without certifying execution', () => {
  const canon = source(invariant('JOV-INV-001'));
  const receipt = regenerate(canon);
  assert.equal(receipt.schemaVersion, SOURCE_BOUND_SCHEMA);
  assert.equal(receipt.authority, 'evidence-only');
  assert.deepEqual(receipt.founderQueue, []);
  const result = evaluateStewardshipSources(receipt, canon);
  assert.equal(result.state, 'verified');
  assert.deepEqual(result.errors, []);
  assert.equal(result.facts[0].id, 'JOV-INV-001');
  assert.equal(
    result.facts[0].source.ref,
    'canon/invariants.jsonl#JOV-INV-001'
  );
  assert.equal(result.executionStatus, 'not-certified');
  assert.deepEqual(result.findings, []);
  assert.deepEqual(regenerate(canon), receipt);
});

test('source change invalidates a receipt until verified regeneration', () => {
  const oldSource = source(invariant('JOV-INV-001'));
  const currentSource = source(
    invariant('JOV-INV-001', {
      policy: { key: 'fixture.source', value: { mode: 'changed' } },
    })
  );
  const oldReceipt = regenerate(oldSource);
  const stale = evaluateStewardshipSources(oldReceipt, currentSource);
  assert.equal(stale.state, 'stale');
  assert.deepEqual(stale.findings, []);
  assert.deepEqual(stale.facts, []);
  assert.equal(
    evaluateStewardshipSources(regenerate(currentSource), currentSource).state,
    'verified'
  );
  assert.equal(
    evaluateStewardshipSources(oldReceipt, oldSource).state,
    'verified'
  );
});

test('missing authority is unknown and cannot reuse cached receipt facts', () => {
  const receipt = regenerate(source(invariant('JOV-INV-001')));
  const result = evaluateStewardshipSources(receipt, null);
  assert.equal(result.state, 'unknown');
  assert.equal(result.source.digest, null);
  assert.deepEqual(result.facts, []);
  assert.deepEqual(result.findings, []);
});

test('CLI and Ovie projection omit healthy facts and suppress all unverified work queues', () => {
  const canon = source(invariant('JOV-INV-001'), invariant('JOV-INV-002'));
  const receipt = regenerate(canon);
  const verified = projectStewardshipEvidence(receipt, canon);
  assert.equal(verified.evidence.state, 'verified');
  assert.equal(verified.summary.candidates, 2);
  assert.equal(verified.summerQueue.length, 1);
  assert.deepEqual(verified.summerQueue, verified.actionableExceptions);
  assert.equal('facts' in verified.evidence, false);
  assert.equal('findings' in verified.evidence, false);
  const mixed = projectStewardshipEvidence(
    { ...receipt, candidates: [{ id: 'old' }], window: { period: 'old' } },
    canon
  );
  assert.equal(mixed.summary.candidates, 2);
  assert.equal(mixed.window, null);
  assert.deepEqual(verified.founderQueue, []);
  assert.equal(verified.drillDown, 'canon/invariants.jsonl');
  /** @type {Array<[unknown, string | null]>} */
  const cases = [
    [receipt, null],
    [receipt, source(invariant('JOV-INV-003'))],
    [{ ...receipt, declaredFindings: [] }, canon],
    [null, canon],
  ];
  for (const [audit, actual] of cases) {
    const projection = projectStewardshipEvidence(audit, actual);
    assert.deepEqual(projection.summerQueue, []);
    assert.deepEqual(projection.actionableExceptions, []);
    assert.deepEqual(projection.founderQueue, []);
    assert.equal(projection.summary.actionableExceptions, 0);
    assert.equal(projection.summary.founderDecisions, 0);
  }
});

test('overlapping contradictory authority yields stable exact-evidence decision findings', () => {
  const left = invariant('JOV-INV-001');
  const right = invariant('JOV-INV-002', {
    authority: { owner: 'Gem', approvedBy: 'Founder' },
    policy: { key: 'fixture.source', value: { mode: 'competing' } },
  });
  const canon = source(right, left);
  const result = evaluateStewardshipSources(regenerate(canon), canon);
  assert.equal(result.state, 'verified');
  assert.equal(result.findings.length, 1);
  const [finding] = result.findings;
  assert.equal(finding.id, 'conflict:JOV-INV-001:JOV-INV-002');
  assert.equal(finding.kind, 'conflicting');
  assert.equal(finding.action, 'explicit-decision-required');
  assert.equal(finding.owner, 'Summer');
  assert.deepEqual(finding.canonicalOwners, ['Gem', 'Summer']);
  assert.deepEqual(finding.scope, {
    products: ['Jovie'],
    surfaces: ['test-surface'],
  });
  assert.equal(finding.evidence.length, 2);
  assert.ok(
    finding.evidence.every(item => /^sha256:[a-f0-9]{64}$/.test(item.digest))
  );
  const changed = source(left, {
    ...right,
    statement: 'A source edit does not change finding identity.',
  });
  const next = evaluateStewardshipSources(regenerate(changed), changed)
    .findings[0];
  assert.equal(next.id, finding.id);
  assert.notDeepEqual(next.evidence, finding.evidence);
  assert.equal(left.policy.value.mode, 'canonical');
  assert.equal(right.policy.value.mode, 'competing');
});

test('separate product/surface scopes, historical rows and derived cache references do not conflict', () => {
  const left = invariant('JOV-INV-001', {
    enforcementConsumers: [
      { name: 'derived cache', path: 'generated/cache.json' },
    ],
    lifecycle: {
      state: 'adopted',
      supersedes: ['JOV-INV-004'],
      supersededBy: null,
    },
  });
  const canon = source(
    left,
    invariant('JOV-INV-002', {
      scope: { products: ['Other'], surfaces: ['test-surface'] },
      policy: { key: 'fixture.source', value: 2 },
    }),
    invariant('JOV-INV-003', {
      scope: { products: ['Jovie'], surfaces: ['other-surface'] },
      policy: { key: 'fixture.source', value: 3 },
    }),
    invariant('JOV-INV-004', {
      lifecycle: {
        state: 'superseded',
        supersedes: [],
        supersededBy: 'JOV-INV-001',
      },
      policy: { key: 'fixture.source', value: 4 },
    })
  );
  const result = evaluateStewardshipSources(regenerate(canon), canon);
  assert.equal(result.state, 'verified');
  assert.deepEqual(result.findings, []);
  assert.equal(result.facts.length, 4);
});

test('wildcard intersections count and equal structured values are deterministic duplicates', () => {
  const canon = source(
    invariant('JOV-INV-001', {
      scope: { products: ['*'], surfaces: ['*'] },
      policy: { key: 'fixture.source', value: { a: 1, b: 2 } },
    }),
    invariant('JOV-INV-002', {
      policy: { key: 'fixture.source', value: { b: 2, a: 1 } },
    })
  );
  const result = evaluateStewardshipSources(regenerate(canon), canon);
  assert.equal(result.findings[0].kind, 'duplicate');
  assert.equal(result.findings[0].id, 'duplicate:JOV-INV-001:JOV-INV-002');
  assert.equal(result.findings[0].action, 'regenerate-derived-projection');
  assert.deepEqual(result.findings[0].scope, {
    products: ['Jovie'],
    surfaces: ['test-surface'],
  });
});

test('unilateral supersession cannot suppress a competing active authority', () => {
  const canon = source(
    invariant('JOV-INV-001', {
      lifecycle: {
        state: 'adopted',
        supersedes: ['JOV-INV-002'],
        supersededBy: null,
      },
    }),
    invariant('JOV-INV-002', {
      policy: { key: 'fixture.source', value: false },
    })
  );
  assert.equal(
    evaluateStewardshipSources(regenerate(canon), canon).findings[0].kind,
    'conflicting'
  );
});

test('superseded canonical history requires reciprocal local disposition or evidenced external custody', () => {
  const unreciprocated = source(
    invariant('JOV-INV-001'),
    invariant('JOV-INV-002', {
      lifecycle: {
        state: 'superseded',
        supersedes: [],
        supersededBy: 'JOV-INV-001',
      },
    })
  );
  assert.throws(() => regenerate(unreciprocated), /supersession-invalid/);
  const repo = 'JovieInc/external-authority';
  const moved = invariant('JOV-INV-002', {
    lifecycle: { state: 'superseded', supersedes: [], supersededBy: repo },
    enforcementConsumers: [
      { name: 'moved consumer', path: 'consumer.mjs', repo },
    ],
    evidence: {
      tests: [{ name: 'moved test', path: 'test.mjs', repo }],
      deliberateRed: [{ name: 'moved red', path: 'test.mjs', repo }],
    },
  });
  const external = source(invariant('JOV-INV-001'), moved);
  assert.equal(
    evaluateStewardshipSources(regenerate(external), external).state,
    'verified'
  );
  moved.evidence.tests[0].repo = 'JovieInc/other';
  assert.throws(
    () => regenerate(source(invariant('JOV-INV-001'), moved)),
    /supersession-invalid/
  );
});

test('a matching digest cannot authorize tampered facts, findings or founder decisions', () => {
  const canon = source(invariant('JOV-INV-001'));
  for (const mutate of [
    receipt => {
      receipt.facts[0].authority.owner = 'forged';
    },
    receipt => {
      receipt.declaredFindings = [{ id: 'forged' }];
    },
    receipt => {
      receipt.founderQueue = [{ id: 'forged' }];
    },
    receipt => {
      receipt.sourceBinding.path = 'other.json';
    },
    receipt => {
      receipt.causalEvent.kind = 'schedule';
    },
    receipt => {
      receipt.generatedAt = 'unknown';
    },
    receipt => {
      receipt.generatedAt = '2026-02-30T00:00:00Z';
    },
  ]) {
    const receipt = regenerate(canon);
    mutate(receipt);
    const result = evaluateStewardshipSources(receipt, canon);
    assert.equal(result.state, 'invalid');
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.facts, []);
  }
});

test('malformed authority and receipt inputs fail closed without throwing', () => {
  const valid = source(invariant('JOV-INV-001'));
  const receipt = regenerate(valid);
  const malformedSources = [
    '',
    'not json',
    '{}\n',
    source(),
    source(invariant('JOV-INV-001'), invariant('JOV-INV-001')),
    source(
      invariant('JOV-INV-001', { scope: { products: [], surfaces: ['x'] } })
    ),
    source(
      invariant('JOV-INV-001', {
        lifecycle: { state: 'adopted', supersedes: null, supersededBy: null },
      })
    ),
    source(invariant('JOV-INV-001', { authority: { owner: '' } })),
    source(
      invariant('JOV-INV-001', {
        effective: { date: '2026-02-30', version: 1 },
      })
    ),
  ];
  for (const canon of malformedSources) {
    assert.equal(evaluateStewardshipSources(receipt, canon).state, 'invalid');
    assert.throws(() => regenerate(canon));
  }
  for (const audit of [
    null,
    [],
    {},
    { schemaVersion: 'unknown' },
    { schemaVersion: 'jovie-invariant-stewardship-audit/v1' },
  ]) {
    assert.equal(evaluateStewardshipSources(audit, valid).state, 'invalid');
  }
  assert.throws(() =>
    regenerateStewardshipAudit(valid, {
      causalEvent: { ...EVENT, kind: 'schedule' },
      generatedAt: GENERATED_AT,
    })
  );
});

test('current repository canon can regenerate without a second authority', () => {
  const canon = readFileSync(
    new URL('../../../canon/invariants.jsonl', import.meta.url),
    'utf8'
  );
  const receipt = regenerate(canon);
  assert.ok(receipt.facts.length > 20);
  assert.equal(evaluateStewardshipSources(receipt, canon).state, 'verified');
});

test('generation time and delivery age cannot promote or expire unchanged source evidence', () => {
  const canon = source(invariant('JOV-INV-001'));
  const receipt = regenerateStewardshipAudit(canon, {
    causalEvent: EVENT,
    generatedAt: '2020-01-01T00:00:00Z',
  });
  assert.equal(evaluateStewardshipSources(receipt, canon).state, 'verified');
  const historical = JSON.parse(
    readFileSync(
      new URL(
        '../../../apps/web/lib/ovie/generated/invariant-stewardship.current-week.json',
        import.meta.url
      ),
      'utf8'
    )
  );
  historical.generatedAt = GENERATED_AT;
  historical.sourceBinding = receipt.sourceBinding;
  assert.equal(
    evaluateStewardshipSources(historical, canon).state,
    'historical'
  );
  historical.candidates[0].relations = {};
  assert.equal(evaluateStewardshipSources(historical, canon).state, 'invalid');
});

test('an injected clock rejects future-dated evidence without an age quota', () => {
  const canon = source(invariant('JOV-INV-001'));
  const now = new Date('2026-11-16T23:59:00.000Z');
  const receipt = regenerate(canon);
  assert.equal(
    evaluateStewardshipSources(receipt, canon, { now }).state,
    'verified'
  );
  now.setMilliseconds(-1);
  const future = evaluateStewardshipSources(receipt, canon, { now });
  assert.equal(future.state, 'invalid');
  assert.match(
    future.errors[0],
    /canon\/invariants.jsonl: generated-at-future/
  );
  assert.match(future.remediation, /regenerate source-bound/);
  assert.deepEqual(
    projectStewardshipEvidence(receipt, canon, { now }).summerQueue,
    []
  );
});
