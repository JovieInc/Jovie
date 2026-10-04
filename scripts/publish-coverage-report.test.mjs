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
  publishCoverageReport,
  publishNightlyReport,
} from './lib/publish-coverage-report.mjs';

const heatmap = 'docs/TEST_COVERAGE_HEATMAP.md';
const snapshot = 'apps/web/reports/test-coverage-snapshot.json';
const url = 'https://github.com/JovieInc/Jovie/pull/123';

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
  const change = () => writeFileSync(join(cwd, heatmap), 'measured coverage\n');
  return { cwd, root, remote, git, source, env, calls, gh, change };
}

test('publishes only measured reports on an exact-source draft branch while main is protected', t => {
  const f = fixture(t);
  f.change();
  writeFileSync(join(f.cwd, snapshot), '{"coverage":86.8}\n');
  writeFileSync(join(f.cwd, 'untracked.txt'), 'not a report');
  const result = publishCoverageReport(f);
  assert.equal(result.url, url);
  assert.equal(result.status, 'published');
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
  assert.deepEqual(f.calls[0], [
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
  const pr = f.calls.find(args => args[0] === 'pr');
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
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh\nif [ "$2" = create ]; then echo '${url}'; elif [ "$2" = list ]; then echo '[]'; fi\n`,
    { mode: 0o755 }
  );
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

test('a rejected branch push fails the audit without creating a PR or touching main', t => {
  const f = fixture(t);
  f.change();
  writeFileSync(join(f.remote, 'hooks/update'), '#!/bin/sh\nexit 1\n', {
    mode: 0o755,
  });
  assert.throws(() => publishCoverageReport(f), /Command failed/);
  assert.equal(f.calls.length, 1);
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
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh\nif [ "$2" = create ]; then echo '${url}'; elif [ "$2" = list ]; then echo '[]'; fi\n`,
    { mode: 0o755 }
  );
  const env = { ...f.env, PATH: `${bin}:${process.env.PATH}` };
  delete env.GITHUB_STEP_SUMMARY;
  assert.equal(publishCoverageReport({ cwd: f.cwd, env }).url, url);
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
