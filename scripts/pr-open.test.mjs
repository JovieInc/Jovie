import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

test('refresh edits once when the body changed and never requests stale reruns', async () => {
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
  // The body changed, so a single PATCH carries the exact final body and
  // fires exactly one edited event (JOV-10354: one flight per update).
  assert.deepEqual(edits, ['final body']);
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

test('a byte-identical update still forces a fresh event with the marker round-trip', async () => {
  const pr = targetPr(42);
  const edits = [];
  let reads = 0;
  const github = (_cwd, args) => {
    if (!args.includes('PATCH'))
      return ok({
        workflow_runs: reads++ < 2 ? freshRuns(pr, 1) : freshRuns(pr, 3),
      });
    edits.push(
      JSON.parse(readFileSync(args[args.indexOf('--input') + 1], 'utf8')).body
    );
    return okText('');
  };
  await refreshBodyChecks('.', pr, pr.body, pr.title, {
    github,
    pause: async () => {},
    log: () => {},
  });
  // GitHub emits no edited event for an identical body: the marker mutation
  // is the only way to request fresh checks, and the second edit restores
  // the exact final body.
  assert.equal(edits.length, 2);
  assert.match(edits[0], /pr-open-refresh/);
  assert.equal(edits[1], pr.body);
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
  // The drafted body differs from the live one, so the update emits exactly
  // one PATCH (one edited event, one Source Validation flight; JOV-10354).
  assert.equal(edits.length, 1);
  assert.match(edits[0], /Changes: apps\/web\/lib\/target/);
  assert.match(edits[0], /pr-open-target: JovieInc\/Jovie#42/);
  assert.doesNotMatch(edits[0], /unrelated checkout|pull\/99/);
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

test('new PR checks use remote main when local main is stale', async () => {
  const { repo, cleanup } = localRepo();
  const bodyDir = mkdtempSync(path.join(tmpdir(), 'pr-open-remote-base-'));
  const bodyFile = path.join(bodyDir, 'body.md');
  const git = args =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  try {
    git(['checkout', '-b', 'feature']);
    git(['branch', '-f', 'main', 'origin/main']);
    writeFileSync(path.join(repo, 'unrelated-baseline.json'), '{}\n');
    git(['add', '.']);
    git(['commit', '-m', 'chore: upstream baseline']);
    git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    writeFileSync(path.join(repo, 'new.txt'), 'feature\n');
    git(['add', '.']);
    git(['commit', '-m', 'chore: feature']);
    writeFileSync(
      bodyFile,
      draftBody({
        title: 'chore(ci): feature',
        files: [file('new.txt')],
        summary: 'Checks the feature against current remote main.',
      })
    );
    const output = [];
    const code = await main(
      ['check', '--repo', repo, '--body-file', bodyFile],
      line => output.push(line),
      {
        execute: (command, args) =>
          command === 'git' && args[0] !== 'show'
            ? okText(git(args))
            : fakeDiffRunner(command, args),
      }
    );
    assert.equal(code, 0, output.join('\n'));
    assert.doesNotMatch(output.join('\n'), /locked-areas/);
    assert.notEqual(
      git(['rev-parse', 'main']),
      git(['rev-parse', 'origin/main'])
    );
  } finally {
    cleanup();
    rmSync(bodyDir, { recursive: true, force: true });
  }
});

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
        : args[0] === 'branch'
          ? okText('fixture/source')
          : args[0] === 'ls-remote'
            ? okText(`${'c'.repeat(40)}\trefs/heads/fixture/source\n`)
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

test('draft uses the remote base when local main is stale without borrowing upstream locked changes', async () => {
  const { repo, cleanup } = localRepo();
  const git = args => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  try {
    git(['checkout', '-b', 'fixture/marketing-source']);
    git(['branch', '-f', 'main', 'HEAD']);
    mkdirSync(path.join(repo, 'apps/web/lib/auth'), { recursive: true });
    writeFileSync(
      path.join(repo, 'apps/web/lib/auth/current-main.ts'),
      'export const current = true;\n'
    );
    git(['add', '.']);
    git(['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'upstream auth']);
    git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    mkdirSync(path.join(repo, 'scripts'), { recursive: true });
    writeFileSync(
      path.join(repo, 'scripts/marketing-source.test.mjs'),
      'export const regression = true;\n'
    );
    git(['add', '.']);
    git([
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-m',
      'chore(marketing): current source',
    ]);
    const out = [];
    const code = await main(
      [
        'draft',
        '--repo',
        repo,
        '--base',
        'main',
        '--title',
        'chore(marketing): current source',
      ],
      x => out.push(x),
      {
        github: () => ({
          status: 1,
          stdout: '',
          stderr: 'no pull requests found',
        }),
        diagnose: () => {},
      }
    );
    assert.equal(code, 0);
    assert.match(out.join('\n'), /marketing-source.test.mjs/);
    assert.doesNotMatch(
      out.join('\n'),
      /Locked areas|current-main.ts|canon-ownership-json/
    );
  } finally {
    cleanup();
  }
});

function publicationFixture(mode = 'normal') {
  const root = mkdtempSync(path.join(tmpdir(), 'pr-open-publication-'));
  const repo = path.join(root, 'repo');
  const remote = path.join(root, 'remote.git');
  const bin = path.join(root, 'bin');
  const hooks = path.join(root, 'hooks');
  const calls = path.join(root, 'gh.jsonl');
  const pushes = path.join(root, 'pushes');
  const guards = path.join(root, 'guards');
  const env = { ...process.env };
  // These owned Git fixtures must never inherit a hook's repository selectors.
  for (const key of Object.keys(env))
    if (key.startsWith('GIT_')) delete env[key];
  const git = args =>
    execFileSync('git', args, {
      cwd: repo,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  mkdirSync(repo);
  mkdirSync(bin);
  mkdirSync(hooks);
  try {
    git(['init', '-b', 'main']);
    git(['config', 'user.email', 'publication@example.invalid']);
    git(['config', 'user.name', 'Publication fixture']);
    git(['config', 'core.hooksPath', hooks]);
    git(['init', '--bare', '-b', 'main', remote]);
    mkdirSync(path.join(repo, 'scripts/lib'), { recursive: true });
    writeFileSync(path.join(repo, '.gitignore'), 'packages/\n');
    writeFileSync(
      path.join(repo, 'scripts/lib/product-lane-classifier.mjs'),
      "import fs from 'node:fs'; fs.appendFileSync(process.env.FIXTURE_GUARDS, 'classifier\\n');\n"
    );
    writeFileSync(
      path.join(repo, 'scripts/check-changed-test-coverage.mjs'),
      "import fs from 'node:fs'; fs.appendFileSync(process.env.FIXTURE_GUARDS, 'coverage\\n'); console.log(JSON.stringify({applicable:false}));\n"
    );
    git(['add', '.']);
    git(['commit', '-m', 'chore: fixture base']);
    git(['remote', 'add', 'origin', remote]);
    git([
      'config',
      '--replace-all',
      'remote.origin.fetch',
      '+refs/heads/main:refs/remotes/origin/main',
    ]);
    git(['push', '-u', 'origin', 'main']);
    const base = git(['rev-parse', 'HEAD']);
    git(['checkout', '-b', 'feature/publication']);
    writeFileSync(
      path.join(repo, 'notes.txt'),
      'documented publication fixture\n'
    );
    git(['add', '.']);
    git(['commit', '-m', 'chore(docs): fixture publication']);
    const head = git(['rev-parse', 'HEAD']);
    if (mode === 'mismatch')
      git(['push', 'origin', `${base}:refs/heads/feature/publication`]);
    if (mode === 'detached') git(['checkout', '--detach', 'HEAD']);
    mkdirSync(path.join(repo, 'packages'));
    cpSync(
      path.join(import.meta.dirname, '../packages/api-client'),
      path.join(repo, 'packages/api-client'),
      {
        recursive: true,
        filter: source => !source.split(path.sep).includes('node_modules'),
      }
    );
    writeFileSync(
      path.join(hooks, 'pre-push'),
      `#!/usr/bin/env node
require('node:fs').appendFileSync(process.env.FIXTURE_PUSHES, 'push\\n');
`
    );
    chmodSync(path.join(hooks, 'pre-push'), 0o755);
    writeFileSync(
      path.join(bin, 'gh'),
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_GH_CALLS, JSON.stringify(args) + '\\n');
if (args[0] !== 'pr' || args[1] !== 'create') process.exit(2);
if (!args.includes('--head')) {
  console.error('aborted: you must first push the current branch to a remote, or use the --head flag'); process.exit(1);
}
if (args[args.indexOf('--head') + 1] !== 'feature/publication' || !args.includes('--draft')) process.exit(2);
console.log('https://github.com/JovieInc/Jovie/pull/42');
`
    );
    chmodSync(path.join(bin, 'gh'), 0o755);
    // Keep the CLI's pre-existing homedir metrics writer inside this fixture,
    // without changing HOME or any production path/authorization behavior.
    const preload = path.join(root, 'isolated-metrics.mjs');
    writeFileSync(
      preload,
      `import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
os.homedir = () => process.env.FIXTURE_RECORD_HOME;
syncBuiltinESMExports();
`
    );
    const body = path.join(root, 'body.md');
    writeFileSync(
      body,
      draftBody({
        title: 'chore(docs): fixture publication',
        files: [file('notes.txt', 'added')],
        summary: 'Publishes an owned documentation fixture.',
      })
    );
    Object.assign(env, {
      PATH: [bin, path.dirname(process.execPath), env.PATH ?? ''].join(
        path.delimiter
      ),
      FIXTURE_PUSHES: pushes,
      FIXTURE_GUARDS: guards,
      FIXTURE_GH_CALLS: calls,
      FIXTURE_RECORD_HOME: path.join(root, 'record-home'),
      JOVIE_API_STATE_DIR: path.join(root, 'api-state'),
      JOVIE_GITHUB_CREDENTIAL: 'pr-open-publication-fixture',
      GH_TOKEN: '',
      GITHUB_TOKEN: '',
    });
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        preload,
        path.join(import.meta.dirname, 'pr-open.mjs'),
        'open',
        '--repo',
        repo,
        '--draft',
        '--body-file',
        body,
        '--title',
        'chore(docs): fixture publication',
        ...(mode === 'normal' ? [] : ['--no-push']),
      ],
      { cwd: repo, env, encoding: 'utf8', timeout: 15_000 }
    );
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return {
      root,
      repo,
      git,
      result,
      head,
      calls: existsSync(calls)
        ? readFileSync(calls, 'utf8')
            .trim()
            .split('\n')
            .map(s => JSON.parse(s))
        : [],
      pushes: existsSync(pushes)
        ? readFileSync(pushes, 'utf8').trim().split('\n')
        : [],
      guards: existsSync(guards) ? readFileSync(guards, 'utf8') : '',
      cleanup: () => rmSync(root, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

test('actual new draft publication verifies the pushed head with a main-only fetch refspec', () => {
  const f = publicationFixture();
  try {
    assert.equal(
      f.git(['config', '--get-all', 'remote.origin.fetch']),
      '+refs/heads/main:refs/remotes/origin/main'
    );
    assert.equal(
      f
        .git([
          'ls-remote',
          '--heads',
          'origin',
          'refs/heads/feature/publication',
        ])
        .split(/\s+/)[0],
      f.head
    );
    assert.equal(f.pushes.length, 1, 'normal push hook runs exactly once');
    assert.match(f.guards, /classifier/);
    assert.match(f.guards, /coverage/);
    assert.equal(f.result.status, 0, f.result.stdout + f.result.stderr);
    assert.equal(
      f.calls.length,
      1,
      'create once after the single successful push'
    );
    assert.equal(
      f.calls[0][f.calls[0].indexOf('--head') + 1],
      'feature/publication'
    );
  } finally {
    f.cleanup();
  }
});

for (const mode of ['unknown', 'mismatch', 'detached']) {
  test(`actual new draft publication refuses ${mode} intended head without creating or pushing`, () => {
    const f = publicationFixture(mode);
    try {
      assert.notEqual(f.result.status, 0);
      assert.equal(f.pushes.length, 0);
      assert.equal(
        f.calls.length,
        0,
        'refusal happens before the GitHub create call'
      );
      assert.match(f.result.stdout, /publication-head/);
    } finally {
      f.cleanup();
    }
  });
}
