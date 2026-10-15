import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { load } from 'js-yaml';
import {
  inFlightReport,
  publishCoverageReport,
  publishNightlyReport,
  REPORT_COALESCE_MS,
} from './lib/publish-coverage-report.mjs';

const heatmap = 'docs/TEST_COVERAGE_HEATMAP.md';
const snapshot = 'apps/web/reports/test-coverage-snapshot.json';
const url = 'https://github.com/JovieInc/Jovie/pull/123';

test('every integrated workflow retains origin data and the handoff grants only read permissions', () => {
  for (const name of [
    'dependabot-auto-merge',
    'dependabot-pin-sync',
    'desktop-release',
    'nightly-testing-agent',
    'production-controller',
    'screenshots',
    'sentry-autofix',
    'shipping-slo',
    'test-coverage-audit',
  ]) {
    const workflow = load(
      readFileSync(
        new URL(`../.github/workflows/${name}.yml`, import.meta.url),
        'utf8'
      )
    );
    const steps = Object.values(workflow.jobs).flatMap(job => job.steps ?? []);
    const publisher = steps.findIndex(step =>
      /emit-automation|publishCoverageReport|publishNightlyReport/.test(
        step.run ?? ''
      )
    );
    const retention = steps.findIndex(
      step => step.with?.name === 'shipping-origin-v1'
    );
    assert.ok(
      publisher >= 0 && retention > publisher,
      `${name} must retain published exact-head origin`
    );
    assert.equal(steps[retention].with['retention-days'], 30);
    assert.ok(!steps[retention].with.overwrite);
  }
  const handoff = load(
    readFileSync(
      new URL('../.github/workflows/shipping-origin.yml', import.meta.url),
      'utf8'
    )
  );
  assert.deepEqual(handoff.permissions, {});
  assert.deepEqual(handoff.jobs.receipt.permissions, { contents: 'read' });
  assert.match(handoff.jobs.receipt.if, /refs\/heads\/main/);
  assert.match(handoff.jobs.receipt.if, /itstimwhite/);
  const token = handoff.jobs.receipt.steps.find(
    step => step.id === 'read-token'
  );
  assert.equal(token.with['permission-contents'], 'read');
  assert.equal(token.with['permission-pull-requests'], 'read');
});

function fixture(t, nightly = false) {
  const root = mkdtempSync(join(tmpdir(), 'coverage-publication-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = join(root, 'checkout');
  const remote = join(root, 'origin.git');
  mkdirSync(cwd);
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'user.name', 'Coverage Test');
  git('config', 'user.email', 'coverage@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  mkdirSync(join(cwd, 'apps/web/reports'), { recursive: true });
  writeFileSync(join(cwd, heatmap), 'before\n');
  writeFileSync(join(cwd, snapshot), '{}\n');
  if (nightly) {
    mkdirSync(join(cwd, 'apps/web/reports/nightly-agent'), { recursive: true });
    writeFileSync(
      join(cwd, 'docs/NIGHTLY_TESTING_AGENT_REPORT.md'),
      'before\n'
    );
    writeFileSync(
      join(cwd, 'apps/web/reports/nightly-agent/last-run.json'),
      '{}\n'
    );
  }
  writeFileSync(join(cwd, 'source.txt'), 'measured\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'initial');
  git('init', '--quiet', '--bare', remote);
  git('remote', 'add', 'origin', remote);
  git('push', '--quiet', 'origin', 'main');
  // Reproduce the hosted boundary: main can never be directly updated.
  writeFileSync(
    join(remote, 'hooks/update'),
    '#!/bin/sh\n[ "$1" != refs/heads/main ]\n',
    { mode: 0o755 }
  );
  const source = git('rev-parse', 'HEAD');
  const env = {
    ...process.env,
    GITHUB_SHA: source,
    GITHUB_REPOSITORY: 'JovieInc/Jovie',
    GITHUB_RUN_ID: '12345',
    GITHUB_WORKFLOW_REF:
      'JovieInc/Jovie/.github/workflows/nightly-testing-agent.yml@refs/heads/main',
    RUNNER_TEMP: root,
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_STEP_SUMMARY: join(root, 'summary.md'),
  };
  const calls = [];
  const gh = args => {
    calls.push(args);
    if (args[0] === 'pr' && args[1] === 'list') return '[]';
    if (args[0] === 'pr' && args[1] === 'create') {
      const body = readFileSync(args[args.indexOf('--body-file') + 1], 'utf8');
      assert.ok(body.includes(source));
      assert.ok(body.includes('/actions/runs/12345/attempts/1'));
      assert.ok(args.includes('--draft'));
      assert.equal(args[args.indexOf('--base') + 1], 'main');
      return url;
    }
    return '';
  };
  const origins = [];
  const recordOrigin = (pr, head) => origins.push({ pr, head });
  const change = () => writeFileSync(join(cwd, heatmap), 'measured coverage\n');
  return {
    cwd,
    root,
    remote,
    git,
    source,
    env,
    calls,
    gh,
    change,
    origins,
    recordOrigin,
  };
}

function installOriginFixture(f, bin) {
  mkdirSync(join(f.cwd, 'scripts/lanes'), { recursive: true });
  for (const name of ['shipping_attribution.py', 'shipping_origin.py']) {
    writeFileSync(
      join(f.cwd, 'scripts/lanes', name),
      readFileSync(new URL(`./lanes/${name}`, import.meta.url))
    );
  }
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh
case "$1:$2" in
  pr:create) echo '${url}' ;;
  pr:list) echo '[]' ;;
  api:repos/JovieInc/Jovie/pulls/123)
    sha=$(git rev-parse HEAD)
    printf '{"number":123,"state":"open","base":{"repo":{"full_name":"JovieInc/Jovie"}},"head":{"sha":"%s","ref":"report","repo":{"full_name":"JovieInc/Jovie"}}}' "$sha" ;;
  api:repos/JovieInc/Jovie/git/ref/heads/report)
    printf '{"object":{"sha":"%s"}}' "$(git rev-parse HEAD)" ;;
  api:repos/JovieInc/Jovie) echo '{"full_name":"JovieInc/Jovie"}' ;;
esac
`,
    { mode: 0o755 }
  );
}

function rejectReportPushes(f, failures, message) {
  writeFileSync(
    join(f.remote, 'hooks/update'),
    `#!/bin/sh
[ "$1" != refs/heads/main ] || exit 1
echo "$3" >> push-attempts
attempts=$(wc -l < push-attempts)
if [ "$attempts" -le ${failures} ]; then
  echo '${message}' >&2
  exit 1
fi
`,
    { mode: 0o755 }
  );
  return () =>
    readFileSync(join(f.remote, 'push-attempts'), 'utf8').trim().split('\n');
}

const workflowCheckTimeout =
  'Unable to determine if workflow can be created or updated due to timeout; `workflows` scope may be required.';

test('publishes only measured reports on an exact-source draft branch while main is protected', t => {
  const f = fixture(t);
  f.change();
  writeFileSync(join(f.cwd, snapshot), '{"coverage":86.8}\n');
  writeFileSync(join(f.cwd, 'untracked.txt'), 'not a report');
  const result = publishCoverageReport(f);
  assert.equal(result.url, url);
  assert.equal(result.status, 'published');
  assert.deepEqual(f.origins, [{ pr: url, head: f.git('rev-parse', 'HEAD') }]);
  assert.equal(f.git('rev-parse', 'HEAD^'), f.source);
  assert.equal(f.git('rev-parse', 'origin/main'), f.source);
  assert.equal(f.git('show', 'HEAD:source.txt'), 'measured');
  assert.deepEqual(
    f
      .git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD')
      .split('\n'),
    [snapshot, heatmap]
  );
  assert.equal(
    f.git('rev-parse', `origin/${result.branch}`),
    f.git('rev-parse', 'HEAD')
  );
  assert.deepEqual(f.calls[0].slice(0, 2), ['pr', 'list']);
  assert.deepEqual(f.calls[1], [
    'auth',
    'setup-git',
    '--hostname',
    'github.com',
  ]);
  assert.match(readFileSync(f.env.GITHUB_STEP_SUMMARY, 'utf8'), /pull\/123/);
  for (const line of f.git('log', '-1', '--format=%B').split('\n'))
    assert.ok(line.length <= 100);
});

test('nightly evidence uses the existing exact-source draft publication with protected main', t => {
  const f = fixture(t, true);
  const report = 'docs/NIGHTLY_TESTING_AGENT_REPORT.md';
  const lastRun = 'apps/web/reports/nightly-agent/last-run.json';
  writeFileSync(join(f.cwd, report), 'Nightly workflow: failure\n');
  writeFileSync(join(f.cwd, lastRun), '{"status":"fail"}\n');
  const result = publishNightlyReport(f);
  assert.equal(result.status, 'published');
  assert.equal(
    f.calls.some(args => args[0] === 'pr' && args[1] === 'list'),
    true
  );
  assert.equal(result.branch, 'bot/nightly-evidence-12345-1');
  assert.equal(f.git('rev-parse', 'HEAD^'), f.source);
  assert.equal(f.git('rev-parse', 'origin/main'), f.source);
  assert.equal(
    f.git('rev-parse', `origin/${result.branch}`),
    f.git('rev-parse', 'HEAD')
  );
  assert.deepEqual(
    f
      .git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD')
      .split('\n'),
    [lastRun, report]
  );
  assert.equal(f.git('show', `HEAD:${lastRun}`), '{"status":"fail"}');
  const pr = f.calls.find(args => args[0] === 'pr' && args[1] === 'create');
  assert.equal(
    pr[pr.indexOf('--title') + 1],
    'chore(testing): refresh nightly testing evidence'
  );
});

test('nightly publication skips unchanged evidence and rejects unrelated coverage output', t => {
  const f = fixture(t, true);
  assert.equal(publishNightlyReport(f).status, 'unchanged');
  f.change();
  assert.throws(() => publishNightlyReport(f), /unrelated/);
  assert.deepEqual(f.calls, []);
});

test('the actual nightly publication step succeeds with main protected', t => {
  const f = fixture(t, true);
  f.git('branch', '--set-upstream-to=origin/main');
  writeFileSync(
    join(f.cwd, 'docs/NIGHTLY_TESTING_AGENT_REPORT.md'),
    'Nightly failed; evidence retained\n'
  );
  mkdirSync(join(f.cwd, 'scripts/lib'), { recursive: true });
  for (const lib of [
    'publish-coverage-report.mjs',
    'retire-coverage-reports.mjs',
  ]) {
    writeFileSync(
      join(f.cwd, `scripts/lib/${lib}`),
      readFileSync(new URL(`./lib/${lib}`, import.meta.url))
    );
  }
  const bin = join(f.root, 'bin');
  mkdirSync(bin);
  installOriginFixture(f, bin);
  const workflow =
    /** @type {{ jobs: { report: { steps: {name?: string, run?: string}[] } } }} */ (
      load(
        readFileSync(
          new URL(
            '../.github/workflows/nightly-testing-agent.yml',
            import.meta.url
          ),
          'utf8'
        )
      )
    );
  const step = workflow.jobs.report.steps.find(
    candidate =>
      candidate.name === 'Commit evidence report when changed' ||
      candidate.name === 'Open nightly evidence PR'
  );
  execFileSync('bash', ['-e', '-c', step.run], {
    cwd: f.cwd,
    env: {
      ...f.env,
      GH_TOKEN: 'synthetic-local-only',
      PATH: `${bin}:${process.env.PATH}`,
    },
    encoding: 'utf8',
  });
  assert.equal(f.git('rev-parse', 'origin/main'), f.source);
  assert.equal(f.git('rev-parse', 'HEAD^'), f.source);
  assert.equal(
    f.git('branch', '--show-current'),
    'bot/nightly-evidence-12345-1'
  );
});

test('does not mint git credentials or create a PR when the report is unchanged', t => {
  const f = fixture(t);
  assert.deepEqual(publishCoverageReport(f), {
    status: 'unchanged',
    source: f.source,
  });
  assert.deepEqual(f.calls, []);
});

test('refuses mismatched source and unrelated staged changes before external publication', t => {
  const f = fixture(t);
  f.change();
  assert.throws(
    () =>
      publishCoverageReport({
        ...f,
        env: { ...f.env, GITHUB_SHA: 'a'.repeat(40) },
      }),
    /differs/
  );
  writeFileSync(join(f.cwd, 'source.txt'), 'unmeasured');
  f.git('add', 'source.txt');
  assert.throws(() => publishCoverageReport(f), /unrelated/);
  assert.deepEqual(f.calls, []);
  assert.equal(f.git('rev-parse', 'HEAD'), f.source);
});

test('rejects missing or malformed producer identity without running publication', t => {
  const f = fixture(t);
  for (const key of [
    'GITHUB_SHA',
    'GITHUB_REPOSITORY',
    'GITHUB_RUN_ID',
    'GITHUB_RUN_ATTEMPT',
  ]) {
    for (const value of [undefined, '--invalid']) {
      assert.throws(
        () => publishCoverageReport({ ...f, env: { ...f.env, [key]: value } }),
        /Invalid coverage/
      );
    }
  }
  assert.deepEqual(f.calls, []);
});

test('report publication retries workflow-check timeouts with the same exact-source commit', async t => {
  for (const nightly of [false, true]) {
    await t.test(nightly ? 'nightly' : 'coverage', sub => {
      const f = fixture(sub, nightly);
      writeFileSync(
        join(f.cwd, nightly ? 'docs/NIGHTLY_TESTING_AGENT_REPORT.md' : heatmap),
        'updated evidence\n'
      );
      const attempts = rejectReportPushes(f, 2, workflowCheckTimeout);
      const waits = [];
      sub.mock.method(Atomics, 'wait', (...args) => {
        waits.push(args[3]);
        return 'timed-out';
      });
      const publish = nightly ? publishNightlyReport : publishCoverageReport;
      const result = publish(f);
      assert.equal(result.status, 'published');
      assert.deepEqual(attempts(), Array(3).fill(f.git('rev-parse', 'HEAD')));
      assert.deepEqual(waits, [1000, 2000]);
      assert.equal(f.git('rev-parse', 'HEAD^'), f.source);
      assert.equal(f.git('rev-parse', 'origin/main'), f.source);
      assert.equal(
        f.git('rev-parse', `origin/${result.branch}`),
        f.git('rev-parse', 'HEAD')
      );
      assert.equal(f.calls.filter(args => args[1] === 'create').length, 1);
    });
  }
});

test('persistent workflow-check timeouts stop after three pushes without creating a PR', t => {
  const f = fixture(t, true);
  writeFileSync(
    join(f.cwd, 'docs/NIGHTLY_TESTING_AGENT_REPORT.md'),
    'evidence\n'
  );
  const attempts = rejectReportPushes(f, 3, workflowCheckTimeout);
  t.mock.method(Atomics, 'wait', () => 'timed-out');
  assert.throws(() => publishNightlyReport(f), /Command failed/);
  assert.equal(attempts().length, 3);
  assert.ok(!f.calls.some(args => args[1] === 'create'));
  assert.equal(f.git('rev-parse', 'origin/main'), f.source);
});

test('a permission-denied branch push fails immediately without creating a PR or touching main', t => {
  const f = fixture(t);
  f.change();
  const attempts = rejectReportPushes(
    f,
    3,
    'refusing to allow a GitHub App to create or update workflow without workflows permission'
  );
  t.mock.method(Atomics, 'wait', () => {
    assert.fail('permission denials must not be retried');
  });
  assert.throws(() => publishCoverageReport(f), /Command failed/);
  assert.equal(attempts().length, 1);
  // The in-flight read, then git auth; no PR is created.
  assert.equal(f.calls.length, 2);
  assert.ok(!f.calls.some(args => args[1] === 'create'));
  assert.equal(f.git('rev-parse', 'origin/main'), f.source);
});

test('PR creation failure and missing receipts fail rather than reporting publication success', async t => {
  for (const fail of [true, false]) {
    await t.test(String(fail), sub => {
      const f = fixture(sub);
      f.change();
      assert.throws(
        () =>
          publishCoverageReport({
            ...f,
            gh: args => {
              if (args[0] === 'pr' && fail)
                throw new Error('PR service unavailable');
              return '';
            },
          }),
        fail ? /PR service unavailable/ : /no receipt/
      );
      assert.equal(f.git('rev-parse', 'origin/main'), f.source);
    });
  }
});

test('uses the real gh command adapter and supports runners without a summary file', t => {
  const f = fixture(t);
  f.change();
  const bin = join(f.root, 'bin');
  mkdirSync(bin);
  installOriginFixture(f, bin);
  const env = { ...f.env, PATH: `${bin}:${process.env.PATH}` };
  delete env.GITHUB_STEP_SUMMARY;
  assert.equal(publishCoverageReport({ cwd: f.cwd, env }).url, url);
  const head = f.git('rev-parse', 'HEAD');
  const receipt = JSON.parse(
    readFileSync(
      join(f.root, 'shipping-origin', `JovieInc-Jovie-123-${head}.json`),
      'utf8'
    )
  );
  assert.equal(receipt.headSha, head);
  assert.equal(receipt.method, 'other-automation');
});

test('real publication retires an ancestor report but preserves divergent measured source', t => {
  const f = fixture(t);
  f.change();
  const divergent = f.git(
    'commit-tree',
    f.git('rev-parse', 'HEAD^{tree}'),
    '-m',
    'other source'
  );
  const body = `Measured source: \`${f.source}\`.`;
  const prior = {
    number: 1,
    isDraft: true,
    labels: [],
    headRefName: 'bot/coverage-audit-1-1',
    body,
  };
  const remotePr = {
    state: 'open',
    draft: true,
    labels: [],
    base: { ref: 'main' },
    body,
    title: 'chore(testing): refresh changed-evidence heatmap',
    head: {
      ref: prior.headRefName,
      sha: 'c'.repeat(40),
      repo: { full_name: f.env.GITHUB_REPOSITORY },
    },
  };
  const closes = [];
  const gh = args => {
    if (args[0] === 'pr' && args[1] === 'edit') {
      assert.deepEqual(args.slice(-2), ['--add-label', 'duplicate']);
      remotePr.labels = [{ name: 'duplicate' }];
      return '';
    }
    if (args[0] === 'pr' && args[1] === 'list')
      return JSON.stringify([
        prior,
        { ...prior, number: 2, body: `Measured source: \`${divergent}\`.` },
      ]);
    if (args[0] === 'pr' && args[1] === 'close') {
      closes.push(args[2]);
      return '';
    }
    if (args.includes('--paginate')) return `${heatmap}\n${snapshot}`;
    if (args[0] === 'api' && args[1].includes('/git/commits/'))
      return JSON.stringify({ parents: [{ sha: f.source }] });
    if (args[0] === 'api') return JSON.stringify(remotePr);
    return f.gh(args);
  };
  assert.equal(publishCoverageReport({ ...f, gh }).url, url);
  assert.deepEqual(closes, ['1']);
  assert.match(
    readFileSync(f.env.GITHUB_STEP_SUMMARY, 'utf8'),
    /Retired reports: 1/
  );
});

test('actual nightly publisher retires matching nightly evidence while retaining coverage reports', t => {
  const f = fixture(t, true);
  writeFileSync(
    join(f.cwd, 'docs/NIGHTLY_TESTING_AGENT_REPORT.md'),
    'replacement evidence\n'
  );
  const nightly = {
    number: 1,
    headRefName: 'bot/nightly-evidence-111-1',
    isDraft: true,
    labels: [],
    body: `Measured source: \`${f.source}\`.`,
  };
  const coverage = {
    ...nightly,
    number: 2,
    headRefName: 'bot/coverage-audit-112-1',
  };
  const metadata = {
    state: 'open',
    draft: true,
    labels: [],
    base: { ref: 'main' },
    title: 'chore(testing): refresh nightly testing evidence',
    body: nightly.body,
    head: {
      ref: nightly.headRefName,
      sha: 'c'.repeat(40),
      repo: { full_name: f.env.GITHUB_REPOSITORY },
    },
  };
  const closed = [];
  const gh = args => {
    if (args[0] === 'pr' && args[1] === 'edit') {
      assert.deepEqual(args.slice(-2), ['--add-label', 'duplicate']);
      metadata.labels = [{ name: 'duplicate' }];
      return '';
    }
    if (args[0] === 'pr' && args[1] === 'list')
      return JSON.stringify([coverage, nightly]);
    if (args[0] === 'pr' && args[1] === 'close') {
      closed.push(Number(args[2]));
      return '';
    }
    if (args[0] === 'api') {
      assert.ok(
        !args.some(arg => /pulls\/2(?:\/|$)/.test(arg)),
        'coverage reports must never reach nightly retirement reads'
      );
      if (args.includes('--paginate'))
        return 'docs/NIGHTLY_TESTING_AGENT_REPORT.md\napps/web/reports/nightly-agent/last-run.json';
      if (args[1].includes('/git/commits/'))
        return JSON.stringify({ parents: [{ sha: f.source }] });
      return JSON.stringify(metadata);
    }
    return f.gh(args);
  };
  assert.equal(publishNightlyReport({ ...f, gh }).status, 'published');
  assert.deepEqual(closed, [1]);
});

test('a report PR in flight absorbs a newer measurement instead of a new PR', t => {
  const f = fixture(t, true);
  writeFileSync(
    join(f.cwd, 'docs/NIGHTLY_TESTING_AGENT_REPORT.md'),
    'Nightly workflow: success\n'
  );
  const now = Date.parse('2026-10-12T12:00:00Z');
  const open = [
    {
      number: 77,
      headRefName: 'bot/nightly-evidence-111-1',
      createdAt: '2026-10-12T10:00:00Z',
    },
  ];
  const gh = args => {
    f.calls.push(args);
    if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify(open);
    throw new Error(`unexpected gh ${args.join(' ')}`);
  };
  const result = publishNightlyReport({ ...f, gh, now });
  assert.deepEqual(result, { status: 'coalesced', source: f.source, into: 77 });
  assert.equal(f.git('rev-parse', 'HEAD'), f.source, 'no report branch');
  assert.match(
    readFileSync(f.env.GITHUB_STEP_SUMMARY, 'utf8'),
    /coalesced into #77/
  );
});

test('a conflicted report PR is replaced instead of absorbing new measurements', () => {
  const now = Date.parse('2026-10-13T09:30:00Z');
  const rows = [
    {
      number: 21585,
      headRefName: 'bot/nightly-evidence-38372905104-1',
      createdAt: '2026-10-13T09:22:56Z',
      mergeable: 'CONFLICTING',
    },
  ];
  assert.equal(inFlightReport(rows, 'nightly-evidence', now), null);
  assert.equal(
    inFlightReport(
      [{ ...rows[0], mergeable: 'UNKNOWN' }],
      'nightly-evidence',
      now
    )?.number,
    21585,
    'unknown mergeability still coalesces'
  );
});

test('only an open report PR of the same profile inside the window coalesces', () => {
  const now = Date.parse('2026-10-12T12:00:00Z');
  const at = ms => new Date(now - ms).toISOString();
  const rows = [
    {
      number: 1,
      headRefName: 'bot/nightly-evidence-1-1',
      createdAt: at(REPORT_COALESCE_MS + 1),
    },
    { number: 2, headRefName: 'bot/coverage-audit-2-1', createdAt: at(60_000) },
    {
      number: 3,
      headRefName: 'feat/nightly-evidence-3-1',
      createdAt: at(60_000),
    },
  ];
  assert.equal(inFlightReport(rows, 'nightly-evidence', now), null);
  assert.equal(inFlightReport(rows, 'coverage-audit', now)?.number, 2);
  assert.equal(
    inFlightReport(
      [
        ...rows,
        {
          number: 4,
          headRefName: 'bot/nightly-evidence-4-2',
          createdAt: at(60_000),
        },
        {
          number: 3,
          headRefName: 'bot/nightly-evidence-3-1',
          createdAt: at(120_000),
        },
      ],
      'nightly-evidence',
      now
    )?.number,
    4
  );
});
