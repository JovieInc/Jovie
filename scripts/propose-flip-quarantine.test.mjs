import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import writer from '../.github/scripts/update-quarantine.js';
import { recordRun } from './lib/flake-ledger.mjs';
import {
  applyFlipQuarantinePlan,
  buildFlipQuarantinePlan,
} from './propose-flip-quarantine.mjs';

const now = Date.parse('2026-11-19T18:00:00Z');
const sha40 = n => `${n}`.repeat(40).slice(0, 40);
const offender = over => ({
  subject: 'workflow:.github/workflows/source-validation.yml',
  workflowPath: '.github/workflows/source-validation.yml',
  flips: 2,
  heads: [sha40('a')],
  firstAt: '2026-11-18T10:00:00.000Z',
  lastAt: '2026-11-19T11:00:00.000Z',
  testFiles: ['apps/web/tests/unit/ci/example.test.ts'],
  failedRunIds: [101, 202],
  ...over,
});
// A real ledger: two same-(head, base) flips of the test file, 7d window.
function ledgerWithFlips() {
  let ledger = {
    schemaVersion: 'jovie-flake-ledger/v1',
    failures: [],
    flips: [],
    retries: [],
  };
  const attempt = (runId, headSha, conclusion, attempt, at) =>
    recordRun(
      ledger,
      {
        workflowPath: '.github/workflows/source-validation.yml',
        runId,
        runAttempt: attempt,
        headSha,
        baseSha: sha40('1'),
        conclusion,
        observedAt: at,
        failedSubjects: ['job:Source Validation'],
        testFile: 'apps/web/tests/unit/ci/example.test.ts',
      },
      { now }
    ).ledger;
  ledger = attempt(1, sha40('a'), 'failure', 1, '2026-11-18T09:00:00.000Z');
  ledger = attempt(2, sha40('a'), 'success', 2, '2026-11-18T10:00:00.000Z');
  ledger = attempt(3, sha40('b'), 'failure', 1, '2026-11-19T09:00:00.000Z');
  ledger = attempt(4, sha40('b'), 'success', 2, '2026-11-19T10:00:00.000Z');
  return ledger;
}

const quarantine = () => ({
  schemaVersion: 1,
  retryBudget: {
    unitDefaultRetries: 1,
    quarantineUnitRetries: 2,
    e2eDefaultRetries: 0,
    quarantineE2eRetries: 2,
    maxRetryAttemptsPerCiRun: 160,
    unitShardCount: 14,
  },
  entries: [],
});

test('two same-head-base flips propose a schema-conformant quarantine entry', () => {
  const plan = buildFlipQuarantinePlan({
    offenders: [offender()],
    quarantine: quarantine(),
    now,
  });
  assert.equal(plan.entries.length, 1);
  const entry = plan.entries[0].entry;
  assert.equal(entry.kind, 'unit');
  assert.equal(entry.path, 'tests/unit/ci/example.test.ts');
  assert.equal(entry.owner, 'platform');
  assert.equal(entry.autoManaged, true);
  assert.equal(entry.expiresAt, '2026-12-03');
  // fixIssueUrl is resolved by apply through the Linear intake primitive.
  assert.equal(entry.fixIssueUrl, null);
  writer.validateLedger({
    ...quarantine(),
    entries: [
      { ...entry, fixIssueUrl: 'https://linear.app/jovie/issue/JOV-13105' },
    ],
  });
  assert.equal(
    plan.entries[0].pendingIssue.fingerprint,
    `deflake:flip:${entry.id}`
  );
});

test('an already-quarantined test is skipped; a 14-day-old entry escalates', () => {
  const plan = buildFlipQuarantinePlan({
    offenders: [
      offender({
        subject: 'workflow:x.yml',
        testFiles: ['apps/web/tests/unit/ci/example.test.ts'],
      }),
      offender({ subject: 'step:other', testFiles: [] }),
    ],
    quarantine: {
      ...quarantine(),
      entries: [
        {
          id: 'auto-0000',
          kind: 'unit',
          path: 'tests/unit/ci/example.test.ts',
          owner: 'platform',
          firstSeenAt: '2026-11-01',
          reproductionCommand:
            'pnpm --filter @jovie/web exec vitest run tests/unit/ci/example.test.ts',
          fixIssueUrl: 'https://linear.app/jovie/issue/JOV-13104',
          expiresAt: '2026-12-01',
          quarantinedAt: '2026-10-01T00:00:00.000Z',
          lastSeenFlakyAt: '2026-11-18T00:00:00.000Z',
          consecutiveSuccesses: 0,
          autoManaged: true,
        },
      ],
    },
    now,
  });
  assert.deepEqual(plan.entries, []);
  assert.equal(plan.escalations.length, 1);
  assert.match(plan.escalations[0].message, /age cap/);
  assert.match(plan.escalations[0].message, /not Tim/);
  assert.equal(plan.skipped.length, 1);
  // Offenders without a test file still get an owner issue, never an entry.
  assert.equal(plan.ownerIssues.length, 1);
});

test('apply resolves owner issues, validates the ledger and opens a draft PR', async () => {
  const root = join(tmpdir(), `flip-quarantine-${now}`);
  mkdirSync(join(root, 'apps/web/tests'), { recursive: true });
  try {
    const ledger = ledgerWithFlips();
    const calls = [];
    const execute = (command, args) => {
      calls.push([command, ...args]);
      if (command === 'git' && args[0] === 'rev-parse')
        return `${sha40('f')}\n`;
      if (command === 'gh' && args[0] === 'pr')
        return 'https://github.com/JovieInc/Jovie/pull/999\n';
      return '';
    };
    const result = await applyFlipQuarantinePlan({
      ledger,
      quarantine: quarantine(),
      root,
      now,
      execute,
      upsert: async () => ({
        ok: true,
        action: 'created',
        identifier: 'JOV-13199',
        url: 'https://linear.app/jovie/issue/JOV-13199',
      }),
    });
    assert.equal(result.url, 'https://github.com/JovieInc/Jovie/pull/999');
    assert.deepEqual(result.added, ['tests/unit/ci/example.test.ts']);
    const written = JSON.parse(
      readFileSync(join(root, 'apps/web/tests/quarantine.json'), 'utf8')
    );
    assert.equal(
      written.entries[0].fixIssueUrl,
      'https://linear.app/jovie/issue/JOV-13199'
    );
    assert.equal(existsSync(join(root, '.git')), false);
    assert.ok(calls.some(args => args.includes('switch')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('apply fails closed without a resolvable Linear issue URL', async () => {
  const ledger = ledgerWithFlips();
  await assert.rejects(
    () =>
      applyFlipQuarantinePlan({
        ledger,
        quarantine: quarantine(),
        root: tmpdir(),
        now,
        execute: () => '',
        upsert: async () => ({ ok: false, reason: 'missing_linear_api_key' }),
      }),
    /upsert failed/
  );
});
