import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  emptyNativeLedger,
  reconcileNativeScan,
  validateNativeLedger,
} from './deepsec-native-reconcile.mjs';
import {
  subscriptionPlan,
  subscriptionReceipt,
} from './deepsec-subscription.mjs';

const files = [
  'apps/web/lib/auth/require-auth.ts',
  'apps/web/lib/auth/cached.ts',
];
const plan = subscriptionPlan({
  sourceRoot: '/tmp/source',
  workspace: '/tmp/native',
  headSha: 'a'.repeat(40),
  files,
  repository: 'JovieInc/Jovie',
  headRepository: 'JovieInc/Jovie',
});
const issueUrl = 'https://linear.app/jovie/issue/JOV-123/native-finding';
const finding = (overrides = {}) => ({
  title: 'Auth boundary',
  description: 'Concrete auth defect ghp_abcdefghijklmnopqrstuvwxyz',
  severity: 'HIGH',
  metadata: {
    projectId: 'jovie',
    filePath: files[0],
    vulnSlug: 'auth-boundary',
    lineNumbers: [10],
    issue: null,
  },
  ...overrides,
});
function scan(id, findings = [], analyses = 2) {
  return {
    findings,
    receipt: subscriptionReceipt({
      plan,
      observedHead: plan.headSha,
      sourceChanged: false,
      findings,
      result: {
        status: findings.length ? 1 : 0,
        stdout: `Scanning 2 file(s)…\nProcessing complete. Run: ${id}\n  Analyses: ${analyses}\n  Findings: ${findings.length}\n${findings.length ? `${findings.length} new finding(s) — exiting 1` : 'No findings.'}\n`,
      },
    }),
  };
}
function fixture() {
  const calls = [],
    comments = [];
  return {
    calls,
    comments,
    input: {
      ...scan('first', [finding()]),
      files,
      scope: 'main',
      ledger: emptyNativeLedger(),
      lease: async () => {
        calls.push('lease');
      },
      upsert: async plan => {
        calls.push(['upsert', plan]);
        return { ok: true, url: issueUrl };
      },
      close: async plan => {
        calls.push(['close', plan]);
        return { ok: true };
      },
      writeComment: async body => {
        comments.push(body);
      },
    },
  };
}

test('real receipt findings dedupe by path/class, nullable issue uses canonical intake and redaction', async () => {
  const f = fixture();
  f.input.findings.push(
    finding({
      severity: 'LOW',
      metadata: { ...finding().metadata, lineNumbers: [20] },
    })
  );
  Object.assign(f.input, scan('first', f.input.findings));
  const result = await reconcileNativeScan(f.input);
  assert.equal(result.ledger.entries.length, 1);
  assert.equal(result.ledger.entries[0].issueUrl, issueUrl);
  assert.equal(result.ledger.entries[0].observedOnMain, true);
  const intake = f.calls.filter(
    row => Array.isArray(row) && row[0] === 'upsert'
  );
  assert.equal(intake.length, 1);
  assert.equal(intake[0][1].priority, 2);
  assert.match(intake[0][1].description, /Lines 10/);
  assert.match(intake[0][1].description, /Lines 20/);
  assert.doesNotMatch(intake[0][1].description, /ghp_/);
  assert.deepEqual(f.input.ledger.entries, []);
});

test('two distinct complete same-model main scans close once; replay makes no external write', async () => {
  const f = fixture();
  let { ledger } = await reconcileNativeScan(f.input);
  f.calls.length = 0;
  ({ ledger } = await reconcileNativeScan({
    ...f.input,
    ...scan('clean-one'),
    ledger,
  }));
  assert.equal(ledger.entries[0].closed, false);
  const replay = await reconcileNativeScan({
    ...f.input,
    ...scan('clean-one'),
    ledger,
  });
  assert.equal(replay.replay, true);
  assert.deepEqual(f.calls, []);
  ({ ledger } = await reconcileNativeScan({
    ...f.input,
    ...scan('clean-two'),
    ledger,
  }));
  assert.equal(ledger.entries[0].closed, true);
  assert.equal(
    f.calls.filter(row => Array.isArray(row) && row[0] === 'close').length,
    1
  );
  ({ ledger } = await reconcileNativeScan({
    ...f.input,
    ...scan('clean-three'),
    ledger,
  }));
  assert.equal(
    f.calls.filter(row => Array.isArray(row) && row[0] === 'close').length,
    1
  );
  const recurrent = await reconcileNativeScan({
    ...f.input,
    ...scan('recurrence', [finding()]),
    ledger,
  });
  assert.equal(recurrent.ledger.entries[0].closed, false);
  assert.deepEqual(recurrent.ledger.entries[0].cleanRuns, []);
});

test('partial analysis and no-candidates interrupt clean verification, foreign roster cannot close', async () => {
  const f = fixture();
  let { ledger } = await reconcileNativeScan(f.input);
  ({ ledger } = await reconcileNativeScan({
    ...f.input,
    ...scan('clean-one'),
    ledger,
  }));
  ({ ledger } = await reconcileNativeScan({
    ...f.input,
    ...scan('partial', [], 1),
    ledger,
  }));
  assert.deepEqual(ledger.entries[0].cleanRuns, []);
  ({ ledger } = await reconcileNativeScan({
    ...f.input,
    ...scan('none', [], 0),
    ledger,
  }));
  assert.equal(ledger.entries[0].closed, false);
  const otherPlan = subscriptionPlan({
    ...plan,
    sourceRoot: '/tmp/source',
    workspace: '/tmp/native',
    repository: 'JovieInc/Jovie',
    headRepository: 'JovieInc/Jovie',
    files: [files[1]],
  });
  const receipt = subscriptionReceipt({
    plan: otherPlan,
    observedHead: plan.headSha,
    sourceChanged: false,
    findings: [],
    result: {
      status: 0,
      stdout:
        'Scanning 1 file(s)…\nProcessing complete. Run: other\n  Analyses: 1\n  Findings: 0\nNo findings.\n',
    },
  });
  ({ ledger } = await reconcileNativeScan({
    ...f.input,
    receipt,
    findings: [],
    files: [files[1]],
    ledger,
  }));
  assert.deepEqual(ledger.entries[0].cleanRuns, []);
});

test('PR advisories replace stale findings with truthful zero/partial results and never close PR-only issues', async () => {
  const f = fixture();
  let { ledger } = await reconcileNativeScan({ ...f.input, scope: 'pr' });
  assert.match(f.comments[0], /JOV-123/);
  assert.equal(ledger.entries[0].observedOnMain, false);
  ({ ledger } = await reconcileNativeScan({
    ...f.input,
    ...scan('pr-clean'),
    scope: 'pr',
    ledger,
  }));
  assert.match(f.comments[1], /No findings in this complete native scan/);
  assert.doesNotMatch(f.comments[1], /JOV-123/);
  await reconcileNativeScan({
    ...f.input,
    ...scan('pr-partial', [], 0),
    scope: 'pr',
    ledger,
  });
  assert.match(f.comments[2], /incomplete analysis/);
  ({ ledger } = await reconcileNativeScan({
    ...f.input,
    ...scan('main-one'),
    ledger,
  }));
  ({ ledger } = await reconcileNativeScan({
    ...f.input,
    ...scan('main-two'),
    ledger,
  }));
  assert.equal(ledger.entries[0].closed, false);
  assert.equal(
    f.calls.some(row => Array.isArray(row) && row[0] === 'close'),
    false
  );
});

test('unknown receipt, malformed ledger/findings and source drift fail before writes', async () => {
  for (const mutate of [
    f => {
      f.input.receipt.route = 'gateway';
    },
    f => {
      f.input.receipt.scannerVersion = 'other';
    },
    f => {
      f.input.receipt.fingerprint = 'b'.repeat(64);
    },
    f => {
      f.input.scope = 'other';
    },
    f => {
      f.input.files = ['.env'];
    },
    f => {
      f.input.findings[0].severity = 'unknown';
    },
    f => {
      f.input.findings[0].metadata.lineNumbers = [-1];
    },
    f => {
      f.input.ledger.runs = ['duplicate', 'duplicate'];
    },
    f => {
      f.input.ledger.entries = [{ fp: 'invented' }];
    },
    f => {
      f.input.lease = async () => {
        throw new Error('source drift');
      };
    },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(reconcileNativeScan(f.input));
    assert.equal(
      f.calls.some(row => Array.isArray(row)),
      false
    );
  }
  assert.throws(() => validateNativeLedger(null));
});

test('failed intake, noncanonical issue URL and failed close preserve the input ledger', async () => {
  for (const response of [
    { ok: false },
    { ok: true, url: 'https://example.com/issue' },
  ]) {
    const f = fixture();
    await assert.rejects(
      reconcileNativeScan({ ...f.input, upsert: async () => response }),
      /intake failed/
    );
    assert.deepEqual(f.input.ledger.entries, []);
  }
  const f = fixture();
  let { ledger } = await reconcileNativeScan(f.input);
  ({ ledger } = await reconcileNativeScan({
    ...f.input,
    ...scan('one'),
    ledger,
  }));
  await assert.rejects(
    reconcileNativeScan({
      ...f.input,
      ...scan('two'),
      ledger,
      close: async () => ({ ok: false }),
    }),
    /closure failed/
  );
  assert.equal(ledger.entries[0].closed, false);
  assert.deepEqual(ledger.entries[0].cleanRuns, ['one']);
});

test('reviewed suppressions avoid reopening canonical false-positive issues', async () => {
  const f = fixture();
  const { ledger } = await reconcileNativeScan(f.input);
  const suppressed = await reconcileNativeScan({
    ...f.input,
    ledger: emptyNativeLedger(),
    suppressionDoc: {
      schemaVersion: 1,
      suppressions: [
        {
          fingerprint: ledger.entries[0].fp,
          path: files[0],
          owner: 'security',
          reason:
            'Reviewed boundary is covered by verified caller authorization.',
          reviewBy: '2026-11-01',
        },
      ],
    },
  });
  assert.equal(suppressed.ledger.entries.length, 0);
  await assert.rejects(
    reconcileNativeScan({ ...f.input, suppressionDoc: { schemaVersion: 0 } }),
    /suppressions/
  );
});
