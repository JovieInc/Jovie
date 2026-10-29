import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  admissionRecord,
  gateDecision,
  qaSwarmFindings,
  remediationEvents,
  signReceipt,
  verifyReceiptSignature,
  visualProofReceipt,
} from './receipt.mjs';
import {
  coverage,
  fingerprint,
  invalidationPlan,
  readSurfaces,
  readTsConst,
  receiptStaleness,
  resolveBindings,
  surfaceBindings,
} from './registry.mjs';
import { RUBRIC_VERSION } from './rubric.mjs';
import {
  finding,
  miniRegistry,
  sampleReceipt,
  tempRegistryRoot,
} from './test-fixtures.mjs';

describe('registry', () => {
  test('the checked-in registry resolves every binding', () => {
    const resolved = resolveBindings(readSurfaces());
    for (const [name, value] of Object.entries(resolved))
      assert.ok(value, `binding ${name} unresolved`);
  });

  test('reads TS model constants, typed or not', () => {
    assert.equal(
      readTsConst("export const CHAT_MODEL = 'zai/glm-5.3';", 'CHAT_MODEL'),
      'zai/glm-5.3'
    );
    assert.equal(readTsConst('export const X: string = "a/b";', 'X'), 'a/b');
    assert.equal(readTsConst('const Y = 1', 'Y'), null);
  });

  test('a surface model change invalidates only the surfaces bound to it', () => {
    const reg = miniRegistry();
    const before = resolveBindings(reg, tempRegistryRoot());
    const after = resolveBindings(reg, tempRegistryRoot({ chat: 'zai/glm-6' }));
    const plan = invalidationPlan(reg, before, after);
    assert.deepEqual(
      plan.surfaces.map(s => s.id),
      ['waitlist']
    );
    assert.equal(plan.recalibrateJudge, false);
    assert.deepEqual(plan.changed, [
      { binding: 'chat', from: 'zai/glm-5.3', to: 'zai/glm-6' },
    ]);
  });

  test('a provider family bump (capacity.json) invalidates drafting surfaces', () => {
    const reg = miniRegistry();
    const plan = invalidationPlan(
      reg,
      resolveBindings(reg, tempRegistryRoot()),
      resolveBindings(reg, tempRegistryRoot({ family: 'gpt-7-terra' }))
    );
    assert.deepEqual(
      plan.surfaces.map(s => s.id),
      ['outbound']
    );
  });

  test("the judge's own model change invalidates everything and re-calibrates", () => {
    const root = tempRegistryRoot();
    const plan = invalidationPlan(
      miniRegistry(),
      resolveBindings(miniRegistry(), root),
      resolveBindings(miniRegistry('claude-opus-6'), root)
    );
    assert.equal(plan.recalibrateJudge, true);
    assert.equal(plan.surfaces.length, 3);
  });

  test('stale receipts: model change, rubric change, expiry, unresolved binding', () => {
    const reg = miniRegistry();
    const surface = reg.surfaces[0];
    const resolved = resolveBindings(reg, tempRegistryRoot());
    const receipt = {
      rubricVersion: RUBRIC_VERSION,
      bindings: surfaceBindings(surface, resolved),
      judgedAt: new Date().toISOString(),
    };
    assert.deepEqual(receiptStaleness(receipt, surface, resolved), []);
    assert.match(
      receiptStaleness(receipt, surface, {
        ...resolved,
        chat: 'zai/glm-6',
      }).join(),
      /model-changed:chat/u
    );
    assert.match(
      receiptStaleness(
        { ...receipt, rubricVersion: 'old' },
        surface,
        resolved
      ).join(),
      /rubric-changed/u
    );
    assert.match(
      receiptStaleness(
        { ...receipt, judgedAt: '2020-01-01T00:00:00Z' },
        surface,
        resolved
      ).join(),
      /expired/u
    );
    assert.match(
      receiptStaleness(receipt, surface, { ...resolved, chat: null }).join(),
      /binding-unresolved:chat/u
    );
    assert.deepEqual(receiptStaleness(null, surface, resolved), ['no-receipt']);
    assert.notEqual(fingerprint({ a: '1' }), fingerprint({ a: '2' }));
  });

  test('coverage expands in ROI order only when every judged surface is green', () => {
    const reg = miniRegistry();
    const resolved = resolveBindings(reg, tempRegistryRoot());
    const green = {
      verdict: 'pass',
      rubricVersion: RUBRIC_VERSION,
      bindings: surfaceBindings(reg.surfaces[0], resolved),
      judgedAt: new Date().toISOString(),
    };
    const blocked = coverage(
      reg,
      { waitlist: { ...green, verdict: 'fail' } },
      resolved
    );
    assert.equal(blocked.next, null);
    assert.deepEqual(blocked.blockedExpansionBy, ['waitlist']);
    const open = coverage(reg, { waitlist: green }, resolved);
    assert.equal(open.next, 'outbound');
    assert.equal(open.coverage, 1 / 3);
  });
});

describe('receipt, signature and gate', () => {
  const key = 'test-key';

  test('nothing-wrong signoff only when every step passed both passes with zero findings', () => {
    assert.equal(sampleReceipt().signoff.nothingWrong, true);
    assert.equal(sampleReceipt({ cold: 'fail' }).signoff.nothingWrong, false);
    assert.equal(
      sampleReceipt({
        findings: [{ ...finding({ severity: 'minor' }), id: '4e-1' }],
      }).signoff.nothingWrong,
      false
    );
    assert.equal(
      sampleReceipt({ unjudgeable: [{ id: '5', title: 'x' }] }).signoff
        .nothingWrong,
      false
    );
  });

  test('signature round-trips and any tamper breaks it', () => {
    const signed = signReceipt(sampleReceipt(), key, 'k1');
    assert.equal(verifyReceiptSignature(signed, key), true);
    assert.equal(verifyReceiptSignature(signed, 'other'), false);
    assert.equal(
      verifyReceiptSignature(
        {
          ...signed,
          verdict: 'pass',
          signoff: { nothingWrong: true, statement: 'forged' },
        },
        key
      ),
      false
    );
    assert.equal(
      verifyReceiptSignature(signReceipt(sampleReceipt(), undefined), key),
      false
    );
  });

  test('gate fails closed: unsigned, no signoff, wrong sha, fail verdict, missing', () => {
    const reg = miniRegistry();
    const surface = reg.surfaces[0];
    const resolved = resolveBindings(reg, tempRegistryRoot());
    const good = signReceipt(sampleReceipt(), key);
    assert.deepEqual(
      gateDecision({ receipt: good, surface, resolved, signingKey: key }),
      { allow: true, reasons: [] }
    );
    assert.match(
      gateDecision({
        receipt: sampleReceipt(),
        surface,
        resolved,
        signingKey: key,
      }).reasons.join(),
      /signature/u
    );
    assert.match(
      gateDecision({
        receipt: good,
        surface,
        resolved,
        signingKey: key,
        sourceSha: 'b'.repeat(40),
      }).reasons.join(),
      /source-sha-mismatch/u
    );
    const bad = signReceipt(
      sampleReceipt({ verdict: 'fail', cold: 'fail' }),
      key
    );
    assert.match(
      gateDecision({
        receipt: bad,
        surface,
        resolved,
        signingKey: key,
      }).reasons.join(),
      /judge-verdict-fail.*no-nothing-wrong-signoff/u
    );
    assert.equal(
      gateDecision({ receipt: null, surface, resolved, signingKey: key }).allow,
      false
    );
    assert.equal(
      gateDecision({ receipt: good, surface: undefined, resolved }).allow,
      false
    );
  });

  test('visual proof and admission record carry the kernel contract', () => {
    const signed = signReceipt(sampleReceipt(), key, 'k1');
    const proof = visualProofReceipt(signed);
    assert.equal(proof.id, 'dogfood-judge:waitlist');
    assert.equal(proof.tier, 'visual_proof');
    assert.equal(proof.status, 'passed');
    assert.match(proof.ref, /^dogfood-judge:waitlist@sha256:[0-9a-f]{32}$/u);
    const admission = admissionRecord(signed);
    assert.equal(admission.schema, 'jovie.dogfood-judge-admission/v1');
    assert.equal(admission.prodSha, 'a'.repeat(40));
    assert.equal(admission.signoff.nothingWrong, true);
    assert.equal(admission.signature.keyId, 'k1');
  });

  test('every finding becomes a remediation event with a close-the-loop trigger; propose input dedupes', () => {
    const f = {
      ...finding(),
      id: '4e-1',
      t: 92,
      video: 'v.mp4',
      imagePath: '/x.png',
      crop: '/c.png',
    };
    const receipt = sampleReceipt({
      verdict: 'fail',
      findings: [f, { ...f, id: '4e-2' }],
    });
    const events = remediationEvents(receipt);
    assert.equal(events.length, 2);
    assert.equal(events[0].priority, 'P0');
    assert.equal(events[0].fastTrack, true);
    assert.match(
      events[0].closeLoop.rejudge,
      /cli\.mjs judge --surface waitlist/u
    );
    const propose = qaSwarmFindings(receipt, events);
    assert.equal(propose.findings.length, 1, 'one issue per failing step');
    assert.equal(propose.findings[0].recipeId, 'vision-critique');
    assert.equal(propose.findings[0].priority, 'P0');
    assert.match(
      propose.findings[0].summary,
      /1 judge finding|Value before price/u
    );
    const cold = remediationEvents(
      sampleReceipt({
        verdict: 'fail',
        findings: [
          {
            ...f,
            id: 'c1',
            criterion: 'COLD',
            evidence: 'cold screenshot test (no context)',
            detail: 'A',
          },
          {
            ...f,
            id: 'c2',
            criterion: 'COLD',
            evidence: 'cold screenshot test (no context)',
            detail: 'B',
          },
        ],
      })
    );
    assert.notEqual(
      cold[0].dedupeKey,
      cold[1].dedupeKey,
      'distinct cold issues must not collapse'
    );
  });
});
