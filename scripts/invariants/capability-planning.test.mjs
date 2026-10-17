import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  evaluatePlanning,
  planningPolicyDigest,
  planningReviewContext,
  planningRisks,
  readPlanningDecisions,
} from './capability-planning.mjs';

const head = 'a'.repeat(40);
const policyDigest = planningPolicyDigest();
const binding = {
  repository: 'JovieInc/Jovie',
  head,
  policyDigest,
  policyVersion: 1,
};
const metrics = {
  controls: 1,
  actions: 1,
  groups: 1,
  tabsRoutesPanels: 2,
  duplicateConcepts: 0,
  scroll: 0,
};
const source = {
  capability: 'one-sheet renderer',
  scope: 'artist PDF',
  owner: 'approved renderer owner',
  runtime: 'existing approved renderer@fixture-v1',
  classification: 'commodity mechanism',
  disposition: 'reuse',
  decisionRef: 'linear:approved-renderer',
  requirements: 'PDF output contract',
  existing: 'approved renderer; current scope confirmed',
  delta:
    'data selection, provenance, narrative, layout and product workflow only',
  costRisk: 'existing integration and update owner; no new infrastructure',
  tests: 'same output/error suite on incumbent and candidate',
  rollback: 'restore prior renderer configuration',
  reevaluate: 'requirements, config, workload or security assumptions change',
  evidenceKind: 'behavior',
};
const surface = {
  surface: 'Work inspector',
  job: 'manage files attached to Work',
  owner: 'canonical Work inspector',
  absorbs: 'Files collection and generic Add',
  source: 'current source at bound head',
  mounted: 'existing inspector mounted; fixture observation',
  design: 'Pen/current owner reference',
  disposition: 'no new surface',
  replaces: 'none; existing Files collection',
  duplication: 'no sibling media actions',
  smallestChange: 'file role metadata inside existing generic flow',
  genericPrimitive: 'one Add action',
  states: 'empty/loading/error/no-data reconcile to Files',
  density: 'long file collection virtualizes; contextual actions',
  deletion: 'none; no surface added',
  newSurfaceReason: 'not applicable; existing owner absorbs job',
  before: metrics,
  after: metrics,
};
const receipt = () => ({
  binding,
  outcome: 'artists publish a one-sheet',
  requirementsRef: 'issue:requirements-v1',
  assumptionsRef: 'issue:security-config-v1',
  sourcing: [structuredClone(source)],
  ia: [],
});
const body = value =>
  `Existing issue/workpad evidence\n\n\`\`\`json\n${JSON.stringify({ planningDecisions: value })}\n\`\`\`\n`;
const evaluate = (value, extra = {}) =>
  evaluatePlanning({ body: body(value), ...binding, ...extra });
const diff = (path, added = 'export const mechanism = 1;') =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n+${added}\n`;

test('approved one-sheet renderer permits custom product data, narrative and workflow', () => {
  const result = evaluate(receipt());
  assert.equal(result.state, 'implementation-candidate');
  assert.deepEqual(result.findings, []);
  assert.equal(result.evidenceVerified, false);
});

test('existing SDK, pure helper, routine fix and docs avoid redundant research', () => {
  for (const path of [
    'lib/approved-client.ts',
    'lib/sum.ts',
    'lib/bug-fix.ts',
    'docs/auth.md',
  ]) {
    const result = evaluatePlanning({ diff: diff(path), ...binding });
    assert.equal(result.state, 'unaffected');
    assert.equal(result.blocking, false);
  }
});

test('deliberate red: Settings, Ovie and Work accretion contradicts no new surface', () => {
  for (const name of [
    'Settings 11 pages',
    'Ovie approval queues',
    'Work media slots',
  ]) {
    const value = receipt();
    value.ia = [
      {
        ...surface,
        surface: name,
        after: { ...metrics, controls: 5, groups: 5 },
      },
    ];
    const result = evaluate(value);
    assert.equal(result.state, 'research-ready');
    assert.ok(
      result.findings.some(f => f.includes('unexplained surface growth'))
    );
    assert.ok(
      result.findings.some(f => f.includes('contradicts no new surface'))
    );
  }
});

test('canonical consolidation and integration pass beside deliberate-red neighbors', () => {
  for (const name of ['Settings', 'Ovie', 'Work']) {
    const value = receipt();
    value.ia = [
      {
        ...surface,
        surface: name,
        disposition: 'surface consolidation',
        before: { ...metrics, controls: 5, groups: 5 },
        deletion: 'merges duplicate controls into the canonical owner',
      },
    ];
    assert.deepEqual(evaluate(value).findings, []);
  }
});

test('deliberate red: proprietary auth/PDF with no new dependency needs evidence', () => {
  for (const path of ['lib/auth/custom.ts', 'lib/pdf/custom.ts']) {
    const value = receipt();
    value.sourcing[0] = {
      ...source,
      capability: 'proprietary mechanism',
      classification: 'proprietary',
      disposition: 'build',
    };
    const result = evaluate(value, { diff: diff(path) });
    assert.equal(result.state, 'research-ready');
    assert.ok(result.findings.some(f => f.includes('classification: invalid')));
    assert.ok(result.findings.some(f => f.includes('vendorIndex')));
    assert.ok(result.findings.some(f => f.includes('alternatives')));
  }
});

test('deliberate red: offline discovery creates executable research instead of permission to build', () => {
  const result = evaluatePlanning({
    diff: diff('lib/passkey/ceremony.ts'),
    ...binding,
  });
  assert.equal(result.state, 'research-ready');
  assert.equal(result.tasks[0].kind, 'bounded-research');
  assert.match(
    result.tasks[0].action,
    /installed versions and official integration index/
  );
  assert.equal(result.blocking, false);
});

test('deliberate red: stale head, repository or policy cannot reuse a receipt', () => {
  for (const key of ['head', 'repository', 'policyDigest', 'policyVersion']) {
    const value = receipt();
    value.binding = { ...binding, [key]: 'stale' };
    assert.ok(evaluate(value).findings.some(f => f.includes(`binding.${key}`)));
  }
});

test('unverified citations, versions and changed security assumptions require semantic review', () => {
  const value = receipt();
  value.sourcing[0].existing = 'unverified claim of an approved source';
  const result = evaluate(value);
  assert.equal(result.evidenceVerified, false);
  assert.equal(result.semanticReview, 'required');
  assert.match(
    planningReviewContext({ body: body(value), ...binding }),
    /Verify cited versions\/scope\/assumptions/
  );
});

test('deliberate red: checker/policy edits and self-signed exceptions never authorize a diff', () => {
  const value = receipt();
  Object.assign(value.sourcing[0], {
    disposition: 'build',
    hardGap: 'fixture hard gap',
    rejectedAdaptation: 'fixture comparison',
    upstream: 'fixture issue',
    reviewRef: 'author approved',
  });
  const result = evaluate(value, {
    diff: diff('scripts/invariants/capability-planning.mjs'),
  });
  assert.ok(
    result.findings.some(f => f.includes('trusted-policy-review-required'))
  );
  assert.ok(
    result.findings.some(f => f.includes('self-attestation is insufficient'))
  );
  assert.equal(result.blocking, false);
});

test('deliberate red: structural strings or SDK import cannot be runtime behavior proof', () => {
  for (const kind of ['source-text', 'sdk-import', undefined]) {
    const value = receipt();
    value.sourcing[0].evidenceKind = kind;
    assert.ok(
      evaluate(value).findings.some(f =>
        f.includes('cannot prove runtime behavior')
      )
    );
  }
});

test('fork provenance/maintenance is required; complete fork still needs independent review', () => {
  const value = receipt();
  Object.assign(value.sourcing[0], {
    disposition: 'fork',
    vendorIndex: 'official integration index reviewed',
    alternatives: [
      {
        source: 'https://example.org/official-fixture',
        version: 'fixture-v1',
        checked: '2026-10-16',
        license: 'MIT',
        fit: 'fixture missing primitive',
      },
    ],
    hardGap: 'required primitive missing',
    rejectedAdaptation: 'narrow adaptation cannot express requirement',
    upstream: 'upstream issue reference',
  });
  assert.ok(evaluate(value).findings.some(f => f.includes('patchScope')));
  Object.assign(value.sourcing[0], {
    license: 'MIT',
    patchScope: 'one missing primitive',
    updateOwner: 'existing owner',
    exitTrigger: 'upstream primitive shipped',
  });
  const findings = evaluate(value).findings;
  assert.equal(findings.length, 1);
  assert.match(findings[0], /independent exception review/);
});

test('deliberate red: duplicate scopes, ambiguous receipts and malformed JSON stay diagnostic', () => {
  const value = receipt();
  value.sourcing.push(structuredClone(source));
  assert.ok(
    evaluate(value).findings.some(f => f.includes('conflicting decisions'))
  );
  assert.throws(
    () => readPlanningDecisions(body(receipt()) + body(receipt())),
    /ambiguous/
  );
  assert.throws(
    () => readPlanningDecisions('```json\n{"planningDecisions":bad}\n```'),
    /invalid planning JSON/
  );
  assert.equal(
    evaluatePlanning({ body: body(receipt()) + body(receipt()), ...binding })
      .blocking,
    false
  );
});

test('renames preserve old mechanism and new UI signals without classifying docs/tests', () => {
  assert.equal(
    planningRisks(
      'diff --git a/lib/auth/old.ts b/lib/moved.ts\n+export const x = 1;'
    ).commodity,
    true
  );
  assert.equal(
    planningRisks(diff('apps/web/screen.tsx', '<Button>Add video</Button>')).ui,
    true
  );
  assert.equal(planningRisks(diff('docs/auth.md')).commodity, false);
  assert.equal(planningRisks(diff('tests/auth.test.ts')).commodity, false);
});

test('incident repair can publish despite missing research and retain a bounded task', () => {
  const result = evaluatePlanning({
    diff: diff('lib/auth/recovery.ts'),
    ...binding,
  });
  assert.equal(result.blocking, false);
  assert.equal(result.tasks[0].head, head);
  assert.equal(result.evidenceVerified, false);
});

test('trusted policy is included and missing policy isolates only the new diagnostics', () => {
  assert.match(
    planningReviewContext({ ...binding, body: body(receipt()) }),
    /Provider-owned lifecycle state is authoritative/
  );
  assert.throws(
    () => planningPolicyDigest(() => ''),
    /missing capability planning policy/
  );
  assert.throws(
    () =>
      planningPolicyDigest(() => '## Capability sourcing and IA integration'),
    /boundary/
  );
  assert.equal(
    planningPolicyDigest(() =>
      readFileSync(
        new URL('../../canon/ENGINEERING.md', import.meta.url),
        'utf8'
      ).replaceAll('\n', '\r\n')
    ),
    policyDigest
  );
});
