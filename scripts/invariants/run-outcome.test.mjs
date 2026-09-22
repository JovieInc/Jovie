import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  applyCertifiedBit,
  canSetCertified,
  persistRunOutcome,
  RUN_OUTCOME_SCHEMA,
  readRunOutcome,
  verifyRunOutcome,
  verifyScreenCertRun,
} from './run-outcome.mjs';
import {
  runScreenCertification,
  SCREEN_CERT_GATE,
  SCREEN_CERT_INVARIANT_ID,
  SCREEN_CERT_SCHEMA,
  SCREEN_REGISTRATION_GATE,
} from './screen-certification.mjs';

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BASE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const DIGEST = `sha256:${'c'.repeat(64)}`;

function harnessCertifiedReceipt(overrides = {}) {
  return {
    schema: SCREEN_CERT_SCHEMA,
    gate: SCREEN_CERT_GATE,
    invariant: SCREEN_CERT_INVARIANT_ID,
    headSha: HEAD,
    baseSha: BASE,
    ok: true,
    certified: true,
    registrationOnly: false,
    status: 'certified',
    issues: [],
    changedScreens: [
      {
        id: 'web.homepage',
        verdict: 'pass',
        findings: [],
        artifactDigest: DIGEST,
        rendererRunUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
      },
    ],
    excludedChanges: [],
    fixtures: [],
    sweeps: [],
    ...overrides,
  };
}

function claim(overrides = {}) {
  return {
    statement: 'web.homepage is certified for this exact head',
    kind: 'screen-certification',
    expectedOutcome: 'pass',
    expectedCertified: true,
    screenIds: ['web.homepage'],
    ...overrides,
  };
}

describe('JOV-6051 per-run outcome verification', () => {
  it('lets only the executable harness set certified:true', () => {
    assert.equal(canSetCertified('harness'), true);
    assert.equal(canSetCertified('jev'), false);
    assert.equal(canSetCertified('model'), false);
    assert.equal(
      applyCertifiedBit({ certifier: 'harness', certified: true }),
      true
    );
    assert.equal(
      applyCertifiedBit({ certifier: 'jev', certified: true }),
      false
    );
    assert.equal(
      applyCertifiedBit({ certifier: 'harness', certified: false }),
      false
    );
  });

  it('records pass and certified:true from a harness-certified receipt', () => {
    const record = verifyRunOutcome({
      runId: 'run-certified-1',
      claim: claim(),
      receipt: harnessCertifiedReceipt(),
      includeShadow: false,
    });
    assert.equal(record.schema, RUN_OUTCOME_SCHEMA);
    assert.equal(record.runId, 'run-certified-1');
    assert.equal(record.outcome, 'pass');
    assert.equal(record.certified, true);
    assert.equal(record.certifier, 'harness');
    assert.equal(record.shipBlocking, false);
    assert.equal(record.shadow, null);
    assert.equal(record.evidence.certified, true);
    assert.equal(record.evidence.changedScreens[0].artifactDigest, DIGEST);
    assert.equal(record.headSha, HEAD);
    const inferred = verifyRunOutcome({
      runId: 'run-certified-inferred-1',
      claim: {
        statement: 'web.homepage is certified for this exact head',
        screenIds: ['web.homepage', ''],
      },
      receipt: harnessCertifiedReceipt(),
      includeShadow: false,
    });
    assert.equal(inferred.outcome, 'pass');
    assert.equal(inferred.certified, true);
    assert.deepEqual(inferred.claim.screenIds, ['web.homepage']);
  });

  it('persists and reads exactly one run outcome', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jovie-run-outcome-'));
    const file = join(dir, 'run.json');
    try {
      const written = verifyRunOutcome({
        runId: 'run-persist-1',
        claim: claim(),
        receipt: harnessCertifiedReceipt(),
        persistTo: file,
        includeShadow: false,
      });
      const read = readRunOutcome(file);
      assert.equal(read.runId, 'run-persist-1');
      assert.equal(read.outcome, 'pass');
      assert.equal(read.certified, true);
      assert.deepEqual(read.claim.screenIds, ['web.homepage']);
      assert.equal(written.evidenceFingerprint, read.evidenceFingerprint);
      const onDisk = JSON.parse(readFileSync(file, 'utf8'));
      assert.equal(onDisk.schema, RUN_OUTCOME_SCHEMA);
      assert.ok(!Array.isArray(onDisk));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses averaged or multi-run persistence and reads', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jovie-run-outcome-'));
    try {
      assert.throws(
        () =>
          persistRunOutcome(
            { schema: RUN_OUTCOME_SCHEMA, runId: 'a', runs: [{}, {}] },
            join(dir, 'avg.json')
          ),
        /average|multi-run/
      );
      assert.throws(
        () => persistRunOutcome({ schema: 'nope', runId: 'a' }, join(dir, 'x')),
        /run-outcome\/v1/
      );
      assert.throws(
        () => persistRunOutcome({ schema: RUN_OUTCOME_SCHEMA }, join(dir, 'x')),
        /runId/
      );
      writeFileSync(join(dir, 'list.json'), '[{},{}]\n');
      assert.throws(
        () => readRunOutcome(join(dir, 'list.json')),
        /exactly one/
      );
      writeFileSync(join(dir, 'bad.json'), '{"schema":"nope","runId":"a"}\n');
      assert.throws(() => readRunOutcome(join(dir, 'bad.json')), /run-outcome/);
      writeFileSync(join(dir, 'norun.json'), '{"schema":"run-outcome/v1"}\n');
      assert.throws(() => readRunOutcome(join(dir, 'norun.json')), /runId/);
      writeFileSync(
        join(dir, 'runs.json'),
        '{"schema":"run-outcome/v1","runId":"a","runs":[{},{}]}\n'
      );
      assert.throws(() => readRunOutcome(join(dir, 'runs.json')), /average/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses to average multiple receipts into one green', () => {
    const record = verifyRunOutcome({
      runId: 'run-avg-1',
      claim: claim(),
      receipts: [harnessCertifiedReceipt(), harnessCertifiedReceipt()],
      includeShadow: false,
    });
    assert.equal(record.outcome, 'unresolved');
    assert.equal(record.certified, false);
    assert.match(record.reason, /averaging/);
  });

  it('fails a success claim when the harness did not certify', () => {
    const record = verifyRunOutcome({
      runId: 'run-fail-1',
      claim: claim(),
      receipt: harnessCertifiedReceipt({
        ok: false,
        certified: false,
        status: 'blocked',
        issues: ['missing exact-head proof for web.homepage'],
        changedScreens: [
          {
            id: 'web.homepage',
            verdict: 'block',
            findings: ['missing exact-head proof for web.homepage'],
          },
        ],
      }),
      includeShadow: false,
    });
    assert.equal(record.outcome, 'fail');
    assert.equal(record.certified, false);
    assert.equal(record.certifier, null);
  });

  it('fails closed when certified:true is inconsistent with ok:false', () => {
    const record = verifyRunOutcome({
      runId: 'run-inconsistent-1',
      claim: claim({ expectedCertified: null, expectedOutcome: null }),
      receipt: harnessCertifiedReceipt({ ok: false, status: 'blocked' }),
      includeShadow: false,
    });
    assert.equal(record.outcome, 'fail');
    assert.equal(record.certified, false);
    assert.match(record.reason, /inconsistent/);
  });

  it('keeps generic ok-without-cert and not-applicable statuses unresolved', () => {
    const generic = verifyRunOutcome({
      runId: 'run-generic-ok-1',
      claim: { statement: 'no-change audit', kind: 'screen-certification' },
      receipt: harnessCertifiedReceipt({
        certified: false,
        status: 'reviewed',
        changedScreens: [],
      }),
      includeShadow: false,
    });
    assert.equal(generic.outcome, 'unresolved');
    assert.match(generic.reason, /ok without certified/);
    const na = verifyRunOutcome({
      runId: 'run-na-1',
      claim: { statement: 'no-change audit', kind: 'screen-certification' },
      receipt: harnessCertifiedReceipt({
        certified: false,
        status: 'not-applicable',
        changedScreens: [],
      }),
      includeShadow: false,
    });
    assert.match(na.reason, /not-applicable/);
    const expectedFail = verifyRunOutcome({
      runId: 'run-evidence-required-fail-1',
      claim: { statement: 'failure needs proof', expectedOutcome: 'fail' },
      receipt: harnessCertifiedReceipt({
        certified: false,
        status: 'evidence-required',
        changedScreens: [],
      }),
      includeShadow: false,
    });
    assert.equal(expectedFail.outcome, 'unresolved');
    assert.match(expectedFail.reason, /not a confirmed failure/);
  });

  it('does not treat harness ok without certification as silent green', () => {
    const real = runScreenCertification({
      headSha: HEAD,
      changedFiles: ['apps/web/app/(home)/page.tsx'],
      registrationOnly: true,
    });
    assert.equal(real.ok, true);
    assert.equal(real.receipt.certified, false);
    const record = verifyScreenCertRun({
      runId: 'run-reg-1',
      claim: {
        statement: 'registration-only homepage change',
        kind: 'screen-certification',
      },
      certOptions: {
        headSha: HEAD,
        changedFiles: ['apps/web/app/(home)/page.tsx'],
        registrationOnly: true,
      },
      includeShadow: false,
    });
    assert.equal(record.outcome, 'unresolved');
    assert.equal(record.certified, false);
    assert.match(record.reason, /not a certified acceptance|source-registered/);
    assert.equal(record.evidence.status, 'source-registered');
  });

  it('leaves missing claim or receipt explicitly unresolved', () => {
    const missingReceipt = verifyRunOutcome({
      runId: 'run-missing-1',
      claim: claim(),
      includeShadow: false,
    });
    assert.equal(missingReceipt.outcome, 'unresolved');
    assert.equal(missingReceipt.certified, false);
    const missingClaim = verifyRunOutcome({
      runId: 'run-missing-2',
      receipt: harnessCertifiedReceipt(),
      includeShadow: false,
    });
    assert.equal(missingClaim.outcome, 'unresolved');
    assert.equal(missingClaim.certified, false);
    const missingId = verifyRunOutcome({
      claim: claim(),
      receipt: harnessCertifiedReceipt(),
      includeShadow: false,
    });
    assert.equal(missingId.outcome, 'unresolved');
    assert.equal(missingId.runId, null);
    const forged = verifyRunOutcome({
      runId: 'run-forged-cert-1',
      claim: { statement: 'forged certification' },
      receipt: { schema: SCREEN_CERT_SCHEMA, ok: true, certified: true },
      includeShadow: false,
    });
    assert.equal(forged.outcome, 'unresolved');
    assert.equal(forged.certified, false);
    assert.match(forged.reason, /exact-head/);
    const findings = verifyRunOutcome({
      runId: 'run-certified-findings-1',
      claim: claim(),
      receipt: harnessCertifiedReceipt({
        changedScreens: [
          { ...harnessCertifiedReceipt().changedScreens[0], findings: ['axe'] },
        ],
      }),
      includeShadow: false,
    });
    assert.equal(findings.outcome, 'unresolved');
    assert.match(findings.reason, /findings/);
  });

  it('rejects malformed certified screen proof before deciding an outcome', () => {
    const row = harnessCertifiedReceipt().changedScreens[0];
    /** @type {Array<[string, Record<string, unknown>, RegExp]>} */
    const cases = [
      [
        'registration gate',
        { gate: SCREEN_REGISTRATION_GATE, registrationOnly: false },
        /registration gate/,
      ],
      ['row shape', { changedScreens: [null] }, /changed screen evidence/],
      [
        'row verdict',
        { changedScreens: [{ ...row, verdict: 'unknown' }] },
        /invalid verdict/,
      ],
      [
        'row findings',
        { changedScreens: [{ ...row, findings: null }] },
        /findings must be an array/,
      ],
      [
        'artifact digest',
        { changedScreens: [{ ...row, artifactDigest: null }] },
        /artifact digest/,
      ],
      [
        'renderer provenance',
        { changedScreens: [{ ...row, rendererRunUrl: 'file:///tmp/run' }] },
        /renderer provenance/,
      ],
      [
        'non-pass proof',
        { changedScreens: [{ ...row, verdict: 'block', findings: ['axe'] }] },
        /pass verdicts/,
      ],
      ['receipt issues', { issues: ['untrusted'] }, /cannot contain issues/],
    ];
    for (const [name, overrides, reason] of cases) {
      const record = verifyRunOutcome({
        runId: `run-malformed-${name.replaceAll(' ', '-')}`,
        claim: claim(),
        receipt: harnessCertifiedReceipt(overrides),
        includeShadow: false,
      });
      assert.equal(record.outcome, 'unresolved', name);
      assert.match(record.reason, reason, name);
    }
  });

  it('does not retry unchanged evidence into a better verdict', () => {
    const first = verifyRunOutcome({
      runId: 'run-lock-1',
      claim: claim({
        expectedOutcome: null,
        expectedCertified: null,
        statement: 'homepage change without a certified claim',
      }),
      receipt: harnessCertifiedReceipt({
        ok: true,
        certified: false,
        status: 'evidence-required',
      }),
      includeShadow: false,
    });
    assert.equal(first.outcome, 'unresolved');
    const second = verifyRunOutcome({
      runId: 'run-lock-1',
      claim: claim({
        expectedOutcome: null,
        expectedCertified: null,
        statement: 'homepage change without a certified claim',
      }),
      receipt: harnessCertifiedReceipt({
        ok: true,
        certified: false,
        status: 'evidence-required',
      }),
      previous: first,
      includeShadow: false,
    });
    assert.equal(second.outcome, 'unresolved');
    assert.equal(second.certified, false);
    assert.match(second.issues.join('\n'), /unchanged evidence/);
    const changedScreen = verifyRunOutcome({
      runId: 'run-lock-1',
      claim: claim({
        expectedOutcome: null,
        expectedCertified: null,
        statement: 'homepage change without a certified claim',
        screenIds: ['web.billing'],
      }),
      receipt: first.evidence,
      previous: first,
      includeShadow: false,
    });
    assert.equal(changedScreen.outcome, 'unresolved');
    assert.notEqual(
      changedScreen.evidenceFingerprint,
      first.evidenceFingerprint
    );
    const changedExpectation = verifyRunOutcome({
      runId: 'run-lock-1',
      claim: claim({ expectedOutcome: 'fail', expectedCertified: null }),
      receipt: first.evidence,
      previous: first,
      includeShadow: false,
    });
    assert.equal(changedExpectation.outcome, 'unresolved');
    assert.notEqual(
      changedExpectation.evidenceFingerprint,
      first.evidenceFingerprint
    );
    const invalidBaseline = verifyRunOutcome({
      runId: 'run-invalid-receipt-1',
      claim: claim({ expectedOutcome: null, expectedCertified: null }),
      receipt: harnessCertifiedReceipt({
        certified: false,
        status: 'evidence-required',
      }),
      includeShadow: false,
    });
    const invalidReceipt = verifyRunOutcome({
      runId: 'run-invalid-receipt-1',
      claim: claim({ expectedOutcome: null, expectedCertified: null }),
      receipt: {
        ...harnessCertifiedReceipt({
          certified: false,
          status: 'evidence-required',
        }),
        sweeps: null,
      },
      previous: invalidBaseline,
      includeShadow: false,
    });
    assert.equal(invalidReceipt.outcome, 'unresolved');
    assert.match(invalidReceipt.reason, /sweeps/);
    const dir = mkdtempSync(join(tmpdir(), 'jovie-run-outcome-lock-'));
    try {
      const lockedFile = join(dir, 'locked.json');
      verifyRunOutcome({
        runId: 'run-lock-1',
        claim: {
          statement: 'homepage change without a certified claim',
          kind: 'screen-certification',
        },
        receipt: harnessCertifiedReceipt({
          ok: true,
          certified: false,
          status: 'evidence-required',
        }),
        previous: first,
        persistTo: lockedFile,
        includeShadow: false,
      });
      assert.equal(readRunOutcome(lockedFile).outcome, 'unresolved');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps a matching failure claim as pass without certifying', () => {
    const record = verifyRunOutcome({
      runId: 'run-expected-fail-1',
      claim: claim({
        expectedOutcome: 'fail',
        expectedCertified: false,
        statement: 'homepage is not certified without trusted proof',
      }),
      receipt: harnessCertifiedReceipt({
        ok: false,
        certified: false,
        status: 'blocked',
        issues: ['missing exact-head proof'],
        changedScreens: [
          {
            id: 'web.homepage',
            verdict: 'block',
            findings: ['missing exact-head proof'],
          },
        ],
      }),
      includeShadow: false,
    });
    assert.equal(record.outcome, 'pass');
    assert.equal(record.certified, false);
  });

  it('rejects a wrong receipt schema as unresolved', () => {
    const record = verifyRunOutcome({
      runId: 'run-schema-1',
      claim: claim(),
      receipt: {
        ...harnessCertifiedReceipt(),
        schema: 'screen-certification/v1',
      },
      includeShadow: false,
    });
    assert.equal(record.outcome, 'unresolved');
    assert.match(record.reason, /screen-certification\/v2/);
  });

  it('accepts a single receipts[] entry and honors an unresolved claim', () => {
    const unresolved = verifyRunOutcome({
      runId: 'run-unresolved-claim-1',
      claim: claim({ expectedOutcome: 'unresolved', expectedCertified: false }),
      receipts: [
        harnessCertifiedReceipt({
          certified: false,
          status: 'evidence-required',
        }),
      ],
      includeShadow: false,
    });
    assert.equal(unresolved.outcome, 'unresolved');
    assert.equal(unresolved.certified, false);
  });

  it('fails when the claim expected the opposite certified bit', () => {
    const unexpectedCert = verifyRunOutcome({
      runId: 'run-unexpected-cert-1',
      claim: claim({ expectedCertified: false, expectedOutcome: null }),
      receipt: harnessCertifiedReceipt(),
      includeShadow: false,
    });
    assert.equal(unexpectedCert.outcome, 'fail');
    assert.equal(unexpectedCert.certified, false);
    const unexpectedPass = verifyRunOutcome({
      runId: 'run-unexpected-pass-1',
      claim: claim({ expectedOutcome: 'fail', expectedCertified: null }),
      receipt: harnessCertifiedReceipt(),
      includeShadow: false,
    });
    assert.equal(unexpectedPass.outcome, 'fail');
    assert.match(unexpectedPass.reason, /contradicted/);
  });

  it('fails a pass/certified claim when the harness receipt is uncertified', () => {
    const receipt = harnessCertifiedReceipt({
      certified: false,
      status: 'evidence-required',
      changedScreens: [
        {
          id: 'web.homepage',
          verdict: 'pass',
          findings: [],
          artifactDigest: DIGEST,
        },
      ],
    });
    const expectedCert = verifyRunOutcome({
      runId: 'run-expected-cert-miss-1',
      claim: claim({ expectedOutcome: null, screenIds: [] }),
      receipt,
      includeShadow: false,
    });
    assert.equal(expectedCert.outcome, 'fail');
    assert.match(expectedCert.reason, /expected certified:true/);
    const expectedPass = verifyRunOutcome({
      runId: 'run-expected-pass-miss-1',
      claim: {
        statement: 'homepage should pass',
        expectedOutcome: 'pass',
      },
      receipt,
      includeShadow: false,
    });
    assert.equal(expectedPass.outcome, 'fail');
    assert.match(expectedPass.reason, /expected pass/);
  });

  it('fails registration-only receipts that still mint certified:true', () => {
    const record = verifyRunOutcome({
      runId: 'run-reg-cert-1',
      claim: claim({ expectedCertified: null, expectedOutcome: null }),
      receipt: harnessCertifiedReceipt({ registrationOnly: true }),
      includeShadow: false,
    });
    assert.equal(record.outcome, 'fail');
    assert.equal(record.certified, false);
    assert.match(record.reason, /registration-only/);
  });

  it('stays unresolved when claimed screens are missing from the receipt', () => {
    const record = verifyRunOutcome({
      runId: 'run-missing-screen-1',
      claim: claim({ screenIds: ['web.start'] }),
      receipt: harnessCertifiedReceipt(),
      includeShadow: false,
    });
    assert.equal(record.outcome, 'unresolved');
    assert.match(record.reason, /web\.start/);
  });

  it('fails a blocked claimed screen and an ok:false receipt with no issues', () => {
    const blocked = verifyRunOutcome({
      runId: 'run-blocked-screen-1',
      claim: claim({ expectedCertified: null, expectedOutcome: null }),
      receipt: harnessCertifiedReceipt({
        ok: true,
        certified: false,
        status: 'blocked',
        changedScreens: [
          { id: 'web.homepage', verdict: 'block', findings: ['axe'] },
        ],
      }),
      includeShadow: false,
    });
    assert.equal(blocked.outcome, 'unresolved');
    const noIssues = verifyRunOutcome({
      runId: 'run-no-issues-1',
      claim: {
        statement: 'homepage evidence run',
        kind: 'screen-certification',
      },
      receipt: harnessCertifiedReceipt({
        ok: false,
        certified: false,
        status: 'blocked',
        issues: [],
        changedScreens: [],
      }),
      includeShadow: false,
    });
    assert.equal(noIssues.outcome, 'fail');
    assert.match(noIssues.reason, /blocked the run/);
  });
});
