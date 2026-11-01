import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { evaluateFleetRules } from './pr-fleet-rules.mjs';
import {
  CUSTOMER_MARKER,
  commonDirectories,
  deriveEvidence,
  draftBody,
  gate,
  lockedCitation,
  main,
  redOutput,
  refreshBodyChecks,
  wipAdmission,
} from './pr-open.mjs';

const file = (filename, status = 'modified') => ({
  filename,
  status,
  patch: '',
});
const metric = 'egress|MB|lower|26|pg_stat_statements|select 1';

test('a drafted compounding body with a measured before passes every body gate', () => {
  const files = [file('scripts/x.mjs'), file('scripts/x.test.mjs', 'added')];
  const title = 'perf(ci): cut x';
  const body = draftBody({
    title,
    files,
    labels: ['compounding'],
    metric,
    summary: 'Cuts x.',
    claim: 'x is cheaper',
    theme: 'cost',
  });
  assert.match(body, /Metric: egress \| MB \| lower \| 26 \| \? \|/);
  assert.match(body, /Pending: yes/);
  assert.deepEqual(
    gate({ title, body, labels: ['compounding'], files }).errors,
    []
  );
});

test('an unmeasured compounding PR is refused instead of getting an invented number', () => {
  const files = [file('scripts/x.mjs')];
  const body = draftBody({
    title: 'perf(ci): x',
    files,
    labels: ['compounding'],
    summary: 's',
  });
  assert.ok(
    gate({ title: 'perf(ci): x', body, labels: ['compounding'], files }).errors
      .length > 0
  );
});

test('a fix: title needs a failing command and run, never a fabricated one', () => {
  const files = [file('scripts/x.mjs'), file('scripts/x.test.mjs', 'added')];
  const bare = draftBody({ title: 'fix(web): x', files, summary: 's' });
  assert.ok(
    gate({ title: 'fix(web): x', body: bare, files }).errors.some(e =>
      e.startsWith('red-before-green')
    )
  );
  const body = draftBody({
    title: 'fix(web): x',
    files,
    summary: 's',
    failingCommand: 'pnpm test',
    failingRun: 'https://github.com/JovieInc/Jovie/actions/runs/123',
  });
  assert.deepEqual(gate({ title: 'fix(web): x', body, files }).errors, []);
});

test('locked paths cite the ownership-map page for their class', () => {
  assert.equal(
    lockedCitation(['apps/web/lib/auth/a.ts']).page,
    'canon-ownership-json'
  );
  assert.equal(
    lockedCitation(['x/y-baseline.json']).page,
    'decisions/engineering/repo-waste-sweep-2026-10-29'
  );
  assert.equal(lockedCitation(['apps/web/lib/a.ts']), null);
  const files = [file('apps/web/lib/auth/a.ts')];
  const body = draftBody({ title: 'chore(auth): a', files, summary: 's' });
  assert.deepEqual(
    gate({ title: 'chore(auth): a', body, files }).errors.filter(e =>
      e.startsWith('locked')
    ),
    []
  );
});

test('customer-facing code gets the internal marker unless declared customer-visible', () => {
  const files = [file('apps/web/lib/a.ts')];
  assert.match(
    draftBody({ title: 'chore: a', files, summary: 's' }),
    /releaseWorthy":false/
  );
});

test('unfilled <placeholders> with spaces are rejected, real HTML tags are not', () => {
  const files = [file('scripts/x.mjs')];
  const body = `${draftBody({ title: 'chore: a', files, summary: 'x' })}\n<what changed and why>\n<details open>`;
  const errors = gate({ title: 'chore: a', body, files }).errors;
  assert.ok(errors.some(e => e.includes('<what changed and why>')));
  assert.ok(!errors.some(e => e.includes('<details open>')));
});

test('placeholder lint ignores inline and fenced code but still rejects prose', () => {
  const files = [file('scripts/x.test.mjs', 'added')];
  const body = `${draftBody({ title: 'chore: docs', files })}\nUse \`<kind>\` and \`\`code \` <type>\`\`.\n\`\`\`ts\nconst x = '<placeholder>';\n\`\`\`\n~~~text\n<another placeholder>\n~~~\n<real missing fact>`;
  const errors = gate({ title: 'chore: docs', body, files }).errors;
  assert.deepEqual(errors, [
    'placeholder: replace <real missing fact> with real content',
  ]);
});

test('Blast radius uses precisely the CI severity and accepts prose', () => {
  const files = [file('scripts/x.test.mjs', 'added')];
  for (const blast of [
    '',
    '## Blast radius\nQueue callers can regress; node --test scripts/x.test.mjs proves admission remains correct.',
  ]) {
    const body = `${CUSTOMER_MARKER}\n## Win\nn/a\n${blast}`;
    const ci = evaluateFleetRules({ pr: { title: 'chore: x', body }, files });
    const local = gate({ title: 'chore: x', body, files });
    assert.deepEqual(local.errors, ci.errors);
    assert.deepEqual(local.warnings, ci.warnings);
  }
});

test('blast paths retain deep common directories and use at most three', () => {
  assert.deepEqual(
    commonDirectories(['apps/web/lib/auth/a.ts', 'apps/web/lib/auth/b.ts']),
    ['apps/web/lib/auth']
  );
  assert.deepEqual(
    commonDirectories([
      'apps/web/lib/auth/a.ts',
      'apps/web/lib/accounts/a.ts',
      'apps/web/lib/billing/a.ts',
      'scripts/x.mjs',
    ]),
    ['apps/web/lib', 'scripts']
  );
  assert.deepEqual(commonDirectories(['a/x', 'b/x', 'c/x', 'd/x']), ['.']);
});

test('draft reports all missing evidence together and emits no placeholders', async () => {
  const { repo, cleanup } = localRepo();
  try {
    const out = [],
      diagnostics = [];
    const code = await main(
      ['draft', '--repo', repo, '--title', 'fix(ci): evidence'],
      x => out.push(x),
      {
        github: () => ({
          status: 1,
          stdout: '',
          stderr: 'no pull requests found',
        }),
        diagnose: x => diagnostics.push(x),
      }
    );
    assert.equal(code, 1);
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0], /--metric/);
    assert.match(diagnostics[0], /--failing-command/);
    assert.match(diagnostics[0], /--failing-run/);
    assert.match(diagnostics[0], /Blast radius proof/);
    // The self URL is filled automatically after open, and is gate-exempt.
    assert.doesNotMatch(
      out.join('\n').replace('<PR URL, set after open>', ''),
      /<[^!][^>]*>/
    );
  } finally {
    cleanup();
  }
});

test('derives last failed CI URL and measured before-value from PR or linked issue', async () => {
  const body = draftBody({
    title: 'perf(ci): x',
    files: [],
    metric,
    summary: 's',
  });
  const pr = targetPr(42, { body, closingIssuesReferences: [{ number: 8 }] });
  const github = (_cwd, args) => {
    if (args[0] === 'issue') return ok({ body });
    return ok([
      {
        workflowName: 'CI',
        event: 'pull_request',
        createdAt: '2026-10-30T20:00:00Z',
        url: 'https://github.com/JovieInc/Jovie/actions/runs/10',
      },
      {
        workflowName: 'Unrelated nightly',
        event: 'schedule',
        createdAt: '2026-10-31T20:00:00Z',
        url: 'https://github.com/JovieInc/Jovie/actions/runs/11',
      },
      {
        workflowName: 'Source Validation',
        event: 'pull_request',
        createdAt: '2026-10-31T18:00:00Z',
        url: 'https://github.com/JovieInc/Jovie/actions/runs/12',
      },
    ]);
  };
  for (const p of [pr, { ...pr, body: 'Fixes #8' }]) {
    const found = await deriveEvidence('.', p, github);
    assert.equal(found.metric, metric);
    assert.equal(
      found.failingRun,
      'https://github.com/JovieInc/Jovie/actions/runs/12'
    );
  }
  assert.deepEqual(
    await deriveEvidence(
      '.',
      { ...pr, body: 'https://github.com/JovieInc/Jovie/pull/99' },
      github
    ),
    {}
  );
});

test('Vitest logs become literal FAIL evidence accepted by Fleet Rules', () => {
  const log =
    '\x1b[31m ❯ scripts/thing.test.ts (3 tests | 1 failed)\x1b[0m\nAssertionError: expected 0 to be 1\n Test Files  1 failed (1)';
  const files = [file('scripts/x.test.mjs', 'added')];
  const body = draftBody({
    title: 'fix(web): regression',
    files,
    failingCommand: 'pnpm exec vitest run',
    failingLog: log,
  });
  assert.match(body, /```text\nFAIL ❯ scripts\/thing.test.ts/);
  assert.deepEqual(
    gate({ title: 'fix(web): regression', body, files }).errors,
    []
  );
  assert.throws(() => redOutput('All 3 tests passed'), /no failure evidence/);
});

test('refresh forces two edits and confirms new runs, never stale reruns', async () => {
  const pr = targetPr(42);
  const edits = [],
    output = [];
  let reads = 0;
  const github = (_cwd, args) => {
    if (!args.includes('PATCH'))
      return ok({
        workflow_runs: reads++ < 2 ? freshRuns(pr, 1) : freshRuns(pr, 3),
      });
    assert.deepEqual(args.slice(0, 4), [
      'api',
      '--method',
      'PATCH',
      'repos/JovieInc/Jovie/pulls/42',
    ]);
    edits.push(
      JSON.parse(readFileSync(args[args.indexOf('--input') + 1], 'utf8')).body
    );
    return okText('');
  };
  await refreshBodyChecks('.', pr, 'final body', pr.title, {
    github,
    pause: async () => {},
    log: x => output.push(x),
  });
  assert.match(edits[0], /pr-open-refresh/);
  assert.equal(edits[1], 'final body');
  assert.equal(output.length, 2);
  assert.match(output[0], /runs\/3/);
  await assert.rejects(
    refreshBodyChecks('.', pr, 'final body', pr.title, {
      github: (_cwd, args) =>
        !args.includes('PATCH')
          ? ok({ workflow_runs: freshRuns(pr, 1) })
          : okText(''),
      pause: async () => {},
    }),
    /not confirmed/
  );
});

test('update N always drafts from PR N diff and title, even in another checkout', async () => {
  const edits = [],
    out = [];
  const pr = targetPr(42);
  let runReads = 0;
  const github = (_cwd, args) => {
    if (args[0] === 'pr' && args[1] === 'view') return ok(pr);
    if (args.some(a => a.includes('/files?')))
      return ok([[file('apps/web/lib/target/own.test.ts', 'added')]]);
    if (args[0] === 'run') return ok([]);
    if (args.includes('PATCH')) {
      edits.push(
        JSON.parse(readFileSync(args[args.indexOf('--input') + 1], 'utf8')).body
      );
      return okText('');
    }
    if (args[0] === 'api')
      return ok({
        workflow_runs: runReads++ ? freshRuns(pr, 3) : freshRuns(pr, 1),
      });
    throw new Error(`unexpected ${args.join(' ')}`);
  };
  const code = await main(['update', '42'], x => out.push(x), {
    github,
    execute: fakeDiffRunner,
    diagnose: () => {},
    pause: async () => {},
  });
  assert.equal(code, 0, out.join('\n'));
  assert.equal(edits.length, 2);
  assert.match(edits[1], /Changes: apps\/web\/lib\/target/);
  assert.match(edits[1], /pr-open-target: JovieInc\/Jovie#42/);
  assert.doesNotMatch(edits[1], /unrelated checkout|pull\/99/);
});

test('update rejects swapped bodies and missing identity before any edit', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pr-open-body-test-'));
  try {
    for (const bad of [
      'https://github.com/JovieInc/Jovie/pull/99',
      'PR #99',
      '<!-- pr-open-target: JovieInc/Jovie#99 -->',
      'no identity at all',
    ]) {
      const filename = path.join(dir, 'body.md');
      writeFileSync(filename, `${CUSTOMER_MARKER}\n${bad}`);
      const calls = [],
        out = [];
      const github = (_cwd, args) => {
        calls.push(args);
        return args[0] === 'pr'
          ? ok(targetPr(42))
          : ok([[file('scripts/target.test.mjs', 'added')]]);
      };
      const result = await main(
        ['update', '42', '--body-file', filename],
        x => out.push(x),
        { github, execute: fakeDiffRunner }
      );
      assert.equal(result, 1);
      assert.match(out.join('\n'), /target:/);
      assert.ok(!calls.some(args => args.includes('PATCH')));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('update refuses moving heads, incomplete diffs and failed target lookups', async () => {
  for (const mode of ['moved', 'incomplete', 'unreadable']) {
    let views = 0;
    const out = [],
      calls = [];
    const github = (_cwd, args) => {
      calls.push(args);
      if (args[1] === 'view') {
        if (mode === 'unreadable')
          return { status: 1, stdout: '', stderr: 'not found' };
        return ok(
          targetPr(
            42,
            views++ && mode === 'moved' ? { headRefOid: 'c'.repeat(40) } : {}
          )
        );
      }
      if (args[0] === 'run') return ok([]);
      return ok(
        mode === 'incomplete'
          ? [[]]
          : [[file('scripts/target.test.mjs', 'added')]]
      );
    };
    assert.equal(
      await main(['update', '42'], x => out.push(x), {
        github,
        execute: fakeDiffRunner,
        diagnose: () => {},
      }),
      1
    );
    assert.ok(!calls.some(args => args.includes('PATCH')));
    assert.match(
      out.join('\n'),
      /changed during|incomplete PR diff|unable to read/
    );
  }
});

function ok(data) {
  return okText(JSON.stringify(data));
}
function okText(stdout) {
  return { status: 0, stdout, stderr: '' };
}
function targetPr(number, overrides = {}) {
  return {
    number,
    title: 'chore: target PR',
    body: 'Original target body',
    labels: [],
    headRefName: 'target-branch',
    headRefOid: 'a'.repeat(40),
    baseRefOid: 'b'.repeat(40),
    baseRefName: 'main',
    url: `https://github.com/JovieInc/Jovie/pull/${number}`,
    changedFiles: 1,
    ...overrides,
  };
}
function freshRuns(pr, id) {
  return ['PR Fleet Rules', 'Source Validation'].map((name, i) => ({
    id: id + i,
    name,
    event: 'pull_request',
    head_sha: pr.headRefOid,
    head_branch: pr.headRefName,
    pull_requests: [{ number: pr.number }],
    html_url: `https://github.com/JovieInc/Jovie/actions/runs/${id + i}`,
  }));
}
function fakeDiffRunner(command, args) {
  if (command === 'git' && args[0] === 'rev-parse')
    return okText(args[1] === 'HEAD' ? 'c'.repeat(40) : args[1]);
  if (command === 'git' && args[0] === 'show') {
    assert.equal(
      args[1],
      'origin/main:scripts/lib/product-lane-classifier.mjs'
    );
    return okText('// trusted');
  }
  if (command === 'git' && args[0] === 'merge-base') return okText('base');
  if (command === 'git' && args[0] === 'log')
    throw new Error('must never read unrelated checkout subjects');
  return args.includes('--plan') ? ok({ applicable: false }) : okText('');
}
function localRepo() {
  const repo = mkdtempSync(path.join(tmpdir(), 'pr-open-repo-'));
  const git = args => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  git(['init']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  writeFileSync(path.join(repo, 'base.txt'), 'base');
  git(['add', '.']);
  git(['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'base']);
  git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  writeFileSync(path.join(repo, 'new.txt'), 'new');
  git(['add', '.']);
  git(['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'chore: change']);
  return {
    repo,
    cleanup: () => rmSync(repo, { recursive: true, force: true }),
  };
}

test('check reports lane-map waiting as pending without a failure', async () => {
  const pr = targetPr(42);
  const output = [];
  const github = (_cwd, args) =>
    args[0] === 'pr'
      ? ok(pr)
      : args[0] === 'run'
        ? ok([])
        : ok([[file('scripts/target.test.mjs', 'added')]]);
  const execute = (command, args) =>
    args.includes('--files-from')
      ? {
          status: 1,
          stdout: '',
          stderr: 'Unmapped changed paths: packages/pending/x.ts',
        }
      : fakeDiffRunner(command, args);
  const result = await main(['check', '42'], x => output.push(x), {
    github,
    execute,
    diagnose: () => {},
  });
  assert.equal(result, 0, output.join('\n'));
  assert.match(output.join('\n'), /pending.*lane-classifier/);
  assert.doesNotMatch(output.join('\n'), /FAIL/);
  assert.match(output.join('\n'), /coverage-plan: target PR head differs/);
});

test('open fills its new self URL after ordinary publication', async () => {
  const { repo, cleanup } = localRepo();
  const filename = path.join(repo, 'body.md');
  writeFileSync(
    filename,
    draftBody({ title: 'perf(ci): cheaper', files: [], metric })
  );
  try {
    let edited;
    const execute = (command, args) =>
      args[0] === 'log'
        ? okText('perf(ci): cheaper')
        : fakeDiffRunner(command, args);
    const github = (_cwd, args) => {
      if (args[1] === 'create')
        return okText('https://github.com/JovieInc/Jovie/pull/42');
      edited = readFileSync(args[args.indexOf('--body-file') + 1], 'utf8');
      return okText('');
    };
    assert.equal(
      await main(['open', '--repo', repo, '--body-file', filename], () => {}, {
        github,
        execute,
      }),
      0
    );
    assert.match(
      edited,
      /Verify: https:\/\/github.com\/JovieInc\/Jovie\/pull\/42/
    );
    assert.doesNotMatch(edited, /<PR URL/);
  } finally {
    cleanup();
  }
});

test('wip admission refuses a producer at its cap and admits when the count is unreadable', () => {
  const seen = [];
  const refused = wipAdmission(
    'codex/jov-1-20261101',
    (command, args) => {
      seen.push([command, ...args]);
      return {
        status: 3,
        stdout: JSON.stringify({
          allowed: false,
          reason: 'wip-cap',
          producer: 'codex',
          used: 8,
          cap: 8,
        }),
        stderr: '',
      };
    },
    '.'
  );
  assert.deepEqual(seen[0], [
    'python3',
    'scripts/lanes/pr_wip.py',
    'admit',
    '--branch',
    'codex/jov-1-20261101',
  ]);
  assert.equal(refused.allowed, false);
  assert.match(refused.message, /`codex\/` already owns 8 open PRs \(cap 8/);
  const unknown = wipAdmission(
    'codex/x',
    () => ({ status: 75, stdout: '', stderr: 'gh unavailable' }),
    '.'
  );
  assert.equal(unknown.allowed, true);
  assert.match(unknown.message, /admitting/);
  const within = wipAdmission(
    'codex/x',
    () => ({
      status: 0,
      stdout: '{"allowed":true,"producer":"codex","used":2,"cap":8}',
      stderr: '',
    }),
    '.'
  );
  assert.deepEqual(within, { allowed: true, message: null });
});

test('open stops before pushing or creating when the producer is over its WIP cap', async () => {
  const { repo, cleanup } = localRepo();
  const filename = path.join(repo, 'body.md');
  writeFileSync(
    filename,
    draftBody({ title: 'perf(ci): cheaper', files: [], metric })
  );
  try {
    const calls = [];
    const execute = (command, args) => {
      if (command === 'python3')
        return {
          status: 3,
          stdout: '{"allowed":false,"producer":"hyperagent","used":36,"cap":5}',
          stderr: '',
        };
      if (args[0] === 'push') calls.push('push');
      return args[0] === 'log'
        ? okText('perf(ci): cheaper')
        : fakeDiffRunner(command, args);
    };
    const github = (_cwd, args) => {
      calls.push(args[1]);
      return okText('');
    };
    const out = [];
    assert.equal(
      await main(
        ['open', '--repo', repo, '--body-file', filename],
        x => out.push(x),
        { github, execute }
      ),
      3
    );
    assert.deepEqual(calls, []);
    assert.match(out.join('\n'), /FAIL {2}wip-cap/);
    let created;
    const overriding = (_cwd, args) => {
      if (args[1] === 'create') {
        created = args;
        return okText('https://github.com/JovieInc/Jovie/pull/43');
      }
      return okText('');
    };
    assert.equal(
      await main(
        [
          'open',
          '--repo',
          repo,
          '--body-file',
          filename,
          '--no-push',
          '--wip-override',
          'this PR installs the cap itself',
        ],
        () => {},
        { github: overriding, execute }
      ),
      0
    );
    assert.equal(created[created.indexOf('--label') + 1], 'wip-override');
  } finally {
    cleanup();
  }
});

test('a referenced Linear issue can supply the measured before-value', async () => {
  const issueBody = draftBody({ title: 'perf(ci): x', files: [], metric });
  const found = await deriveEvidence(
    '.',
    targetPr(42, { title: 'perf(ci): x (JOV-1234)' }),
    () => ok([]),
    async id => {
      assert.equal(id, 'JOV-1234');
      return issueBody;
    }
  );
  assert.equal(found.metric, metric);
});

test('draft resolves the current branch explicitly for gh --repo', async () => {
  const { repo, cleanup } = localRepo();
  try {
    const branch = execFileSync('git', ['branch', '--show-current'], {
      cwd: repo,
      encoding: 'utf8',
    }).trim();
    const github = (_cwd, args) => {
      if (args[0] === 'pr') {
        assert.equal(args[2], branch);
        return ok(targetPr(42));
      }
      return ok([]);
    };
    assert.equal(
      await main(['draft', '--repo', repo], () => {}, {
        github,
        diagnose: () => {},
      }),
      0
    );
  } finally {
    cleanup();
  }
});
