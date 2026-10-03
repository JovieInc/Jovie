import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, test } from 'node:test';
import { buildQuarantineEvidence } from '../.github/scripts/collect-quarantine-evidence.mjs';
import { proposeQuarantineLedger } from './propose-quarantine-ledger.mjs';

test('the commissioned recovery writer cannot slow or supersede the hot report', () => {
  const { load } = createRequire(import.meta.url)('js-yaml');
  const fast = load(
    readFileSync('.github/workflows/test-flakiness-report.yml', 'utf8')
  );
  const recovery = load(
    readFileSync('.github/workflows/quarantine-recovery.yml', 'utf8')
  );
  assert.equal(fast.on.workflow_run.branches[0], 'main');
  assert.equal(fast.concurrency['cancel-in-progress'], true);
  assert.ok(!JSON.stringify(fast).includes('collect-quarantine-evidence.mjs'));
  assert.ok(
    !recovery.on.workflow_run && !recovery.on.pull_request && !recovery.on.push
  );
  assert.equal(recovery.concurrency['cancel-in-progress'], false);
  assert.deepEqual(recovery.permissions, { contents: 'read', actions: 'read' });
  const job = recovery.jobs['recover-quarantine'];
  assert.equal(job.if, "${{ vars.QUARANTINE_AUTO_HEAL_ENABLED == 'true' }}");
  const checkout = job.steps.find(step =>
    step.uses?.startsWith('actions/checkout@')
  );
  assert.equal(checkout.with.ref, 'main');
  assert.equal(checkout.with['persist-credentials'], false);
  const collect = job.steps.find(step => step.id === 'collect');
  assert.equal(collect.env.GH_TOKEN, '${{ github.token }}');
  const intake = job.steps.find(step => step.id === 'intake');
  assert.ok(intake.if.includes("steps.collect.outcome == 'success'"));
  assert.ok(intake.if.includes("steps.analyze.outcome == 'success'"));
  const token = job.steps.find(step => step.id === 'proposal-token');
  assert.ok(token.if.includes("steps.intake.outcome == 'success'"));
  assert.deepEqual(
    Object.keys(token.with)
      .filter(key => key.startsWith('permission-'))
      .sort(),
    ['permission-contents', 'permission-pull-requests']
  );
  const writer = job.steps.find(
    step => step.run === 'node scripts/propose-quarantine-ledger.mjs'
  );
  assert.ok(writer.if.includes("steps.intake.outcome == 'success'"));
  assert.ok(writer.if.includes("steps.proposal-token.outcome == 'success'"));
});

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const now = Date.parse('2026-10-03T12:00:00Z');
const file = 'apps/web/tests/unit/example.test.ts';
const ledgerPath = 'apps/web/tests/quarantine.json';
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'quarantine-draft-test-'));
  roots.push(root);
  const git = args =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  mkdirSync(dirname(join(root, file)), { recursive: true });
  const source = 'export const fixture = true;\n';
  const hash = createHash('sha256').update(source).digest('hex');
  writeFileSync(join(root, file), source);
  const ledger = {
    schemaVersion: 1,
    retryBudget: {
      unitShardCount: 14,
      unitDefaultRetries: 1,
      quarantineUnitRetries: 2,
      e2eDefaultRetries: 0,
      quarantineE2eRetries: 2,
      maxRetryAttemptsPerCiRun: 160,
    },
    entries: [],
  };
  writeFileSync(join(root, ledgerPath), JSON.stringify(ledger));
  git(['init', '--quiet']);
  git(['remote', 'add', 'origin', 'https://github.com/JovieInc/Jovie.git']);
  git(['add', '.']);
  git([
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '--quiet',
    '-m',
    'fixture',
  ]);
  const sourceHead = git(['rev-parse', 'HEAD']);
  const bundles = [1, 2, 3].map(id => ({
    run: {
      id,
      run_attempt: 1,
      head_sha: sourceHead,
      status: 'completed',
      event: 'merge_group',
      repository: 'JovieInc/Jovie',
      created_at: '2026-10-03T11:00:00Z',
    },
    artifacts: [
      {
        artifact: {
          id: id + 100,
          expired: false,
          name: `unit-flaky-${id}-1-0`,
          workflow_run: { id, head_sha: sourceHead },
        },
        reports: [
          {
            schemaVersion: 2,
            complete: true,
            run: {
              repository: 'JovieInc/Jovie',
              headSha: sourceHead,
              runId: id,
              runAttempt: 1,
              event: 'merge_group',
            },
            executions: [
              {
                file,
                fileHash: hash,
                complete: true,
                executedCount: 1,
                skippedCount: 0,
                retryCount: 1,
                outcome: 'flaky',
              },
            ],
          },
        ],
      },
    ],
  }));
  const report = buildQuarantineEvidence(bundles, { headSha: sourceHead, now });
  writeFileSync(join(root, 'quarantine-evidence.json'), JSON.stringify(report));
  writeFileSync(
    join(root, 'flake-issues.json'),
    JSON.stringify({ [file]: 'https://linear.app/jovie/issue/JOV-42' })
  );
  const calls = [],
    bodies = [];
  let mainReads = 0;
  const state = { roster: [], driftAt: Infinity };
  /** @param {string} command @param {string[]} args @param {import('node:child_process').ExecFileSyncOptionsWithStringEncoding} options */
  const execute = (command, args, options) => {
    if (command === 'gh') {
      calls.push({ command, args });
      if (args[0] === 'api')
        return ++mainReads >= state.driftAt ? 'd'.repeat(40) : sourceHead;
      if (args[0] === 'pr' && args[1] === 'list')
        return JSON.stringify(state.roster);
      if (args[0] === 'pr' && args[1] === 'create') {
        bodies.push(
          readFileSync(args[args.indexOf('--body-file') + 1], 'utf8')
        );
        return 'https://github.com/JovieInc/Jovie/pull/42';
      }
      throw new Error('Unexpected GitHub operation');
    }
    if (command === 'git' && args.includes('push')) {
      calls.push({ command, args });
      return '';
    }
    return execFileSync(command, args, options);
  };
  return {
    root,
    git,
    sourceHead,
    report,
    calls,
    bodies,
    state,
    options: { root, now, execute },
  };
}

test('commits a real ledger-only change and creates a canonical draft with native checks required', () => {
  const f = fixture();
  const result = proposeQuarantineLedger(f.options);
  assert.equal(result.url, 'https://github.com/JovieInc/Jovie/pull/42');
  assert.equal(result.sourceHead, f.sourceHead);
  assert.equal(f.git(['rev-parse', 'HEAD^']), f.sourceHead);
  assert.equal(f.git(['diff', '--name-only', 'HEAD^', 'HEAD']), ledgerPath);
  assert.equal(
    JSON.parse(readFileSync(join(f.root, ledgerPath), 'utf8')).entries[0]
      .autoManaged,
    true
  );
  const create = f.calls.find(
    c => c.command === 'gh' && c.args[1] === 'create'
  );
  assert.ok(create.args.includes('--draft'));
  assert.match(f.bodies[0], /native combined-head CI/);
  assert.match(f.bodies[0], /customer-changelog\/v1/);
  assert.ok(f.calls.find(c => c.command === 'git' && c.args.includes('push')));
  assert.ok(f.calls.every(c => !c.args.includes('--force')));
});

test('an existing active proposal blocks duplicate ledger changes', () => {
  const f = fixture();
  f.state.roster = [{ number: 7, headRefName: 'codex/quarantine-heal-old' }];
  assert.deepEqual(proposeQuarantineLedger(f.options), {
    updated: false,
    blockedBy: 7,
  });
  assert.equal(f.git(['rev-parse', 'HEAD']), f.sourceHead);
  assert.equal(f.git(['diff', '--name-only']), '');
  assert.equal(
    f.calls.filter(c => c.args.includes('push') || c.args[1] === 'create')
      .length,
    0
  );
});

test('insufficient execution evidence creates no commit, push or draft', () => {
  const f = fixture();
  f.report.observations.pop();
  writeFileSync(
    join(f.root, 'quarantine-evidence.json'),
    JSON.stringify(f.report)
  );
  assert.equal(proposeQuarantineLedger(f.options).updated, false);
  assert.equal(f.git(['rev-parse', 'HEAD']), f.sourceHead);
  assert.equal(
    f.calls.filter(c => c.args.includes('push') || c.args[1] === 'create')
      .length,
    0
  );
});

test('main drift before collection, before push or before draft creation fails closed', () => {
  for (const driftAt of [1, 4, 5]) {
    const f = fixture();
    f.state.driftAt = driftAt;
    assert.throws(() => proposeQuarantineLedger(f.options), /source changed/);
    assert.equal(
      f.calls.filter(c => c.command === 'gh' && c.args[1] === 'create').length,
      0
    );
    if (driftAt < 5)
      assert.equal(f.calls.filter(c => c.args.includes('push')).length, 0);
  }
});

test('dirty tracked source, an incomplete roster and unverified artifacts reject all writes', () => {
  for (const kind of ['dirty', 'roster', 'artifact']) {
    const f = fixture();
    if (kind === 'dirty') writeFileSync(join(f.root, file), 'changed source');
    if (kind === 'roster')
      f.state.roster = Array.from({ length: 1000 }, (_, number) => ({
        number,
        headRefName: `fixture-${number}`,
      }));
    if (kind === 'artifact') {
      f.report.observations[0].artifactVerified = false;
      writeFileSync(
        join(f.root, 'quarantine-evidence.json'),
        JSON.stringify(f.report)
      );
    }
    assert.throws(() => proposeQuarantineLedger(f.options));
    assert.equal(f.git(['rev-parse', 'HEAD']), f.sourceHead);
    assert.equal(
      f.calls.filter(c => c.args.includes('push') || c.args[1] === 'create')
        .length,
      0
    );
  }
});
