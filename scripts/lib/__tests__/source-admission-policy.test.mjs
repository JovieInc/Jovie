import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  evaluateSourceAdmission,
  runSourceAdmission,
} from '../source-admission-policy.mjs';

const { load } = createRequire(import.meta.url)('js-yaml');

test('trusted source-read guards reject a deleted test on an old head and execute in the source checkout', () => {
  const workflow = load(
    readFileSync('.github/workflows/source-validation.yml', 'utf8')
  );
  const step = workflow.jobs.deterministic.steps.find(
    step =>
      step.name === 'Validate disk-read source contracts from trusted base'
  );
  assert.ok(step, 'disk-read guards must run before queue admission');
  const script = step.run.replace(/\$\{\{\s*github.base_ref\s*\}\}/g, 'main');
  const root = mkdtempSync(join(tmpdir(), 'source-read-bootstrap-'));
  const repo = join(root, 'repo');
  const bin = join(root, 'bin');
  const runner = join(root, 'runner');
  for (const dir of [repo, bin, runner]) mkdirSync(dir, { recursive: true });
  const git = (...args) =>
    execFileSync('/usr/bin/git', args, { cwd: repo, encoding: 'utf8' }).trim();
  try {
    const archive = execFileSync(
      '/usr/bin/git',
      ['archive', 'HEAD', 'scripts'],
      { maxBuffer: 20 * 1024 * 1024 }
    );
    execFileSync('tar', ['-x', '-C', repo], { input: archive });
    const retired = join(repo, 'apps/web/lib/merch/qa-gate.test.ts');
    mkdirSync(join(repo, 'apps/web/lib/merch'), { recursive: true });
    mkdirSync(join(repo, 'apps/web/tests'), { recursive: true });
    const manifest = join(repo, 'apps/web/tests/node-environment-files.json');
    writeFileSync(manifest, '["lib/merch/qa-gate.test.ts"]\n');
    writeFileSync(retired, 'test fixture\n');
    writeFileSync(
      join(bin, 'pnpm'),
      '#!/bin/sh\n[ "$PWD" = "$SOURCE_CHECKOUT" ] || exit 9\ncase "$*" in *node-environment-files.test.ts*) case "$(cat apps/web/tests/node-environment-files.json)" in *qa-gate.test.ts*) test -f apps/web/lib/merch/qa-gate.test.ts ;; *) exit 0 ;; esac ;; *) exit 0 ;; esac\n',
      { mode: 0o755 }
    );
    git('init', '--quiet', '--initial-branch=source-head');
    git('config', 'user.name', 'Source guard test');
    git('config', 'user.email', 'source-guard@example.invalid');
    git('add', '.');
    git('commit', '--quiet', '-m', 'trusted source-read guards');
    git('branch', 'main');
    git('remote', 'add', 'origin', repo);
    git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
    rmSync(join(repo, 'scripts'), { recursive: true });
    rmSync(retired);
    git('add', '--all');
    git('commit', '--quiet', '-m', 'older head deletes a manifest-listed test');
    const invoke = () =>
      spawnSync('/bin/bash', ['-c', script], {
        cwd: repo,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_BASE_REF: 'main',
          EXPECTED_HEAD: git('rev-parse', 'HEAD'),
          RUNNER_TEMP: runner,
          SOURCE_CHECKOUT: repo,
        },
      });
    const rejected = invoke();
    assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
    assert.match(rejected.stdout, /node-environment-files: exit 1/);
    writeFileSync(manifest, '[]\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'remove the retired manifest entry');
    const accepted = invoke();
    assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
    assert.match(accepted.stdout, /node-environment-files: exit 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('source contract rejects a malformed story before queue admission', () => {
  const workflow = load(
    readFileSync('.github/workflows/source-validation.yml', 'utf8')
  );
  const script = workflow.jobs.deterministic.steps
    .find(step => step.name === 'Run deterministic source contract')
    .run.replace(/\$\{\{\s*github.base_ref\s*\}\}/g, 'main');
  const root = mkdtempSync(join(tmpdir(), 'source-story-types-'));
  const repo = join(root, 'repo');
  const bin = join(root, 'bin');
  const types = join(root, 'types');
  for (const dir of [repo, bin, types]) mkdirSync(dir);
  const story = join(repo, 'PersonCell.stories.ts');
  const calls = join(root, 'pnpm.log');
  const git = (...args) =>
    execFileSync('/usr/bin/git', args, { cwd: repo, encoding: 'utf8' }).trim();
  try {
    // Unrelated prerequisites are isolated; the story boundary invokes the
    // real TypeScript compiler rather than returning a canned failure.
    writeFileSync(join(bin, 'node'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(
      join(bin, 'pnpm'),
      `#!/bin/sh
printf '%s\\n' "$*" >> "$FIXTURE_CALLS"
case "$*" in
  '--filter @jovie/web run typecheck:stories')
    exec "$FIXTURE_NODE" "$FIXTURE_TSC" --noEmit --strict --skipLibCheck --typeRoots "$FIXTURE_TYPES" "$FIXTURE_STORY" ;;
esac
exit 0
`,
      { mode: 0o755 }
    );
    const writeStory = invalid =>
      writeFileSync(
        story,
        `type PersonCellProps = { name: string };\nconst args: Partial<PersonCellProps> = { name: 'Anonymous Fan'${invalid ? ', anonymous: true' : ''} };\n`
      );
    writeStory(true);
    git('init', '--quiet', '--initial-branch=main');
    git('config', 'user.name', 'Source story type test');
    git('config', 'user.email', 'source-story-types@example.invalid');
    git('add', '.');
    git('commit', '--quiet', '-m', 'malformed story');
    git('remote', 'add', 'origin', repo);
    const invoke = () => {
      writeFileSync(calls, '');
      return spawnSync('/bin/bash', ['-eo', 'pipefail', '-c', script], {
        cwd: repo,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          EXPECTED_HEAD: git('rev-parse', 'HEAD'),
          FIXTURE_CALLS: calls,
          FIXTURE_NODE: process.execPath,
          FIXTURE_TSC: createRequire(import.meta.url).resolve(
            'typescript/bin/tsc'
          ),
          FIXTURE_TYPES: types,
          FIXTURE_STORY: story,
        },
      });
    };
    const rejected = invoke();
    assert.notEqual(rejected.status, 0, rejected.stdout + rejected.stderr);
    assert.match(rejected.stdout + rejected.stderr, /TS2353/);
    assert.match(readFileSync(calls, 'utf8'), /typecheck:stories\n$/);
    writeStory(false);
    git('add', '.');
    git('commit', '--quiet', '-m', 'use supported story props');
    const accepted = invoke();
    assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
    assert.match(readFileSync(calls, 'utf8'), /component-ship-gate/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('trusted UI admission rejects hover-only affordances even when the head lacks the checker', () => {
  const workflow = load(
    readFileSync('.github/workflows/source-validation.yml', 'utf8')
  );
  const step = workflow.jobs.deterministic.steps.find(
    step => step.name === 'Validate UI interaction source from trusted base'
  );
  assert.ok(step, 'UI source rules must run before queue admission');
  assert.equal(
    step.if,
    undefined,
    'metadata reuse must not skip current UI policy'
  );
  const root = mkdtempSync(join(tmpdir(), 'source-ui-bootstrap-'));
  const repo = join(root, 'repo');
  const runner = join(root, 'runner');
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  mkdirSync(join(repo, 'apps/web/components'), { recursive: true });
  mkdirSync(runner);
  const git = (...args) =>
    execFileSync('/usr/bin/git', args, { cwd: repo, encoding: 'utf8' }).trim();
  const component = join(repo, 'apps/web/components/EvidenceLink.tsx');
  try {
    writeFileSync(
      join(repo, 'scripts/design-frontend-skill-check.mjs'),
      readFileSync('scripts/design-frontend-skill-check.mjs')
    );
    writeFileSync(component, 'export const EvidenceLink = () => <span />;\n');
    git('init', '--quiet', '--initial-branch=source-head');
    git('config', 'user.name', 'Source UI guard test');
    git('config', 'user.email', 'source-ui-guard@example.invalid');
    git('add', '.');
    git('commit', '--quiet', '-m', 'trusted UI policy');
    git('branch', 'main');
    git('remote', 'add', 'origin', repo);
    git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
    rmSync(join(repo, 'scripts'), { recursive: true });
    writeFileSync(
      component,
      "export const EvidenceLink = () => <span className='opacity-0 group-hover:opacity-100' />;\n"
    );
    git('add', '--all');
    git('commit', '--quiet', '-m', 'old head with hover-only evidence');
    const invoke = () =>
      spawnSync('/bin/bash', ['-c', step.run], {
        cwd: repo,
        encoding: 'utf8',
        env: {
          ...process.env,
          BASE_BRANCH: 'main',
          EXPECTED_HEAD: git('rev-parse', 'HEAD'),
          RUNNER_TEMP: runner,
        },
      });
    const rejected = invoke();
    assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
    assert.match(rejected.stdout + rejected.stderr, /FS-006/);
    writeFileSync(
      component,
      "export const EvidenceLink = () => <span className='opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100' />;\n"
    );
    git('add', '.');
    git('commit', '--quiet', '-m', 'make evidence keyboard discoverable');
    const accepted = invoke();
    assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
    assert.match(accepted.stdout, /0 error\(s\)/);
    const stale = spawnSync('/bin/bash', ['-c', step.run], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        BASE_BRANCH: 'main',
        EXPECTED_HEAD: '0'.repeat(40),
        RUNNER_TEMP: runner,
      },
    });
    assert.notEqual(
      stale.status,
      0,
      'a head mismatch must fail before policy execution'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('source and size checks wake when the PR base or contract text is edited', () => {
  for (const file of ['source-validation.yml', 'pr-size-guard.yml']) {
    const workflow = load(readFileSync(`.github/workflows/${file}`, 'utf8'));
    assert.ok(
      workflow.on.pull_request.types.includes('edited'),
      `${file} must revalidate a retargeted PR at the unchanged source head`
    );
  }
});

test('source admission loads the actual changelog guard from trusted base when an older head lacks it', () => {
  const workflow = load(
    readFileSync('.github/workflows/source-validation.yml', 'utf8')
  );
  const trusted = workflow.jobs.deterministic.steps.find(
    step =>
      step.name === 'Validate customer changelog decision from trusted base'
  );
  const source = workflow.jobs.deterministic.steps.find(
    step => step.name === 'Run deterministic source contract'
  );
  const script = (
    trusted?.run ??
    source.run
      .split('\n')
      .find(line => line.includes('node scripts/changelog-source-guard.mjs'))
  ).replace(/\$\{\{\s*github.base_ref\s*\}\}/g, 'main');
  const root = mkdtempSync(join(tmpdir(), 'source-guard-bootstrap-'));
  const repo = join(root, 'repo');
  const bin = join(root, 'bin');
  const runner = join(root, 'runner');
  for (const dir of [repo, bin, runner, join(repo, 'scripts/lib')])
    mkdirSync(dir, { recursive: true });
  const git = (...args) =>
    execFileSync('/usr/bin/git', args, { cwd: repo, encoding: 'utf8' }).trim();
  try {
    for (const file of [
      'scripts/changelog-source-guard.mjs',
      'scripts/lib/gh-retry.sh',
      'scripts/lib/daily-changelog-publication.mjs',
      'scripts/lib/daily-changelog.mjs',
      'scripts/lib/changelog-filter-rules.mjs',
    ]) {
      writeFileSync(join(repo, file), readFileSync(file));
    }
    git('init', '--quiet');
    git('config', 'user.name', 'Source guard test');
    git('config', 'user.email', 'source-guard@example.invalid');
    git('add', '.');
    git('commit', '--quiet', '-m', 'trusted controls');
    const base = git('rev-parse', 'HEAD');
    git('update-ref', 'refs/remotes/origin/main', base);
    rmSync(join(repo, 'scripts'), { recursive: true });
    mkdirSync(join(repo, 'apps/web/app'), { recursive: true });
    writeFileSync(
      join(repo, 'apps/web/app/page.tsx'),
      'export default function Page() { return null; }\n'
    );
    git('add', '--all');
    git('commit', '--quiet', '-m', 'older implementation head');
    const head = git('rev-parse', 'HEAD');
    writeFileSync(
      join(bin, 'git'),
      '#!/bin/sh\nif [ "$1" = fetch ]; then exit 0; fi\nexec /usr/bin/git "$@"\n',
      { mode: 0o755 }
    );
    writeFileSync(
      join(bin, 'gh'),
      '#!/bin/sh\nprintf "%s" "$CURRENT_PR_JSON"\n',
      { mode: 0o755 }
    );
    const eventPath = join(root, 'event.json');
    writeFileSync(
      eventPath,
      JSON.stringify({
        pull_request: {
          number: 7,
          base: { sha: base },
          head: { sha: head },
          created_at: '2026-10-04T00:00:00Z',
        },
      })
    );
    const run = (body, currentHead = head) =>
      spawnSync('bash', ['-eo', 'pipefail', '-c', script], {
        cwd: repo,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          RUNNER_TEMP: runner,
          EXPECTED_HEAD: head,
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_REPOSITORY: 'JovieInc/Jovie',
          CURRENT_PR_JSON: JSON.stringify({ head: { sha: currentHead }, body }),
        },
      });
    const internal = run(
      '<!-- customer-changelog/v1 {"releaseWorthy":false} -->'
    );
    assert.equal(internal.status, 0, internal.stderr);
    const missing = run('');
    assert.notEqual(missing.status, 0);
    assert.match(
      missing.stderr,
      /Customer outcome decision missing or invalid/
    );
    const advanced = run(
      '<!-- customer-changelog/v1 {"releaseWorthy":false} -->',
      'b'.repeat(40)
    );
    assert.notEqual(advanced.status, 0);
    assert.match(advanced.stderr, /PR head advanced/);
    assert.ok(
      workflow.on.pull_request.types.includes('reopened'),
      'reopened recovery must wake exact-head validation'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('source validation rejects type errors and locked UI contract failures before queue admission', () => {
  const workflow = load(
    readFileSync('.github/workflows/source-validation.yml', 'utf8')
  );
  const script = workflow.jobs.deterministic.steps
    .find(step => step.name === 'Run deterministic source contract')
    .run.replace(/\$\{\{[^}]+\}\}/g, 'main');
  const bin = mkdtempSync(join(tmpdir(), 'source-typecheck-contract-'));
  try {
    writeFileSync(
      join(bin, 'git'),
      '#!/bin/sh\nif [ "$1" = rev-parse ]; then printf "%s" "$EXPECTED_HEAD"; fi\n',
      { mode: 0o755 }
    );
    writeFileSync(join(bin, 'node'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(
      join(bin, 'pnpm'),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$COMMAND_LOG"\nif [ "$*" = "$FAIL_TYPECHECK" ]; then exit 17; fi\nexit 0\n',
      { mode: 0o755 }
    );
    for (const command of [
      'typecheck',
      'run typecheck:scripts',
      '--filter @jovie/web run typecheck:tests',
      'screen-registration-gate',
      '--filter @jovie/web exec vitest run --config=vitest.config.mts tests/unit/design-system/mac-header-two-lines-v1.test.ts tests/unit/marketing/marketing-headline-line-clamp-guard.test.ts',
    ]) {
      const commandLog = join(bin, 'commands.log');
      rmSync(commandLog, { force: true });
      const result = spawnSync('bash', ['-eo', 'pipefail', '-c', script], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          EXPECTED_HEAD: 'a'.repeat(40),
          FAIL_TYPECHECK: command,
          COMMAND_LOG: commandLog,
        },
      });
      assert.equal(
        result.status,
        17,
        `${command} must reject source admission: ${result.stderr}`
      );
      assert.ok(
        !readFileSync(commandLog, 'utf8')
          .split('\n')
          .includes('ci:control:test')
      );
    }
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
});

const head = 'a'.repeat(40);
const other = 'b'.repeat(40);
const repository = 'JovieInc/Jovie';
function fixture() {
  return {
    repository,
    expectedHead: head,
    complete: true,
    pr: {
      number: 7,
      title: 'fix(automation): preserve commissioning acceptance',
      body: /** @type {string | null} */ ('Refs JOV-7300.'),
      state: 'open',
      draft: false,
      labels: [],
      head: { sha: head, ref: 'codex/repair', repo: { fork: false } },
      base: { ref: 'main' },
      changed_files: 1,
      mergeable: true,
    },
    files: [{ filename: 'scripts/fix.mjs' }],
    reviews: [],
    statuses: [],
  };
}
function review(state, id = 1, extra = {}) {
  return {
    id,
    state,
    submitted_at: `2026-09-05T00:00:0${id}Z`,
    commit_id: head,
    user: { login: 'reviewer', type: 'User' },
    author_association: 'MEMBER',
    ...extra,
  };
}
function tombstone(context = 'jovie-queue-product-failure/v1') {
  const failureHold = context === 'jovie-queue-failure-hold/v1';
  return {
    context,
    state: 'success',
    description: failureHold
      ? 'class=deterministic-source;n=1;run=123;try=1'
      : context.includes('product')
        ? 'blocked:merge-group-product-failure'
        : 'ejected:UNMERGEABLE',
    creator: { login: 'jovie-bot[bot]', type: 'Bot' },
    target_url: `https://github.com/${repository}/actions/runs/123`,
  };
}
test('qualified source remains eligible with unavailable Symphony, unbound production and unrelated failures', () => {
  const input = fixture();
  input.pr.labels = ['needs-human', 'human-review-required', 'no-auto'].map(
    name => ({ name })
  );
  input.statuses = [
    'symphony-health',
    'production-binding',
    'optional-test',
  ].map(context => ({ context, state: 'failure' }));
  assert.equal(evaluateSourceAdmission(input).allowed, true);
});
test('native closing instructions in conditional or negated prose block admission', () => {
  for (const body of [
    'Related to JOV-7300.\n\nVerify runtime before closing JOV-7300.',
    'Related to JOV-7300.\n\nSource merge does not complete JOV-7300.',
    'Refs JOV-7300.\n\nFixes https://linear.app/jovie/issue/JOV-7300/title',
    'Refs JOV-7300.\n\nResolves [JOV-7300](https://linear.app/jovie/issue/JOV-7300/title)',
    'Refs JOV-7300.\n\nCLOSED `jov-7300`',
  ]) {
    const input = fixture();
    input.pr.body = body;
    assert.deepEqual(
      evaluateSourceAdmission(input).blockers,
      ['linear-closing-reference:JOV-7300'],
      body
    );
  }
  const input = fixture();
  input.pr.title = 'Fixes JOV-7300';
  assert.equal(evaluateSourceAdmission(input).allowed, false);
  for (const keyword of [
    'close',
    'closes',
    'closed',
    'closing',
    'fix',
    'fixes',
    'fixed',
    'fixing',
    'resolve',
    'resolves',
    'resolved',
    'resolving',
    'complete',
    'completes',
    'completed',
    'completing',
    'implement',
    'implements',
    'implemented',
    'implementing',
    'linear issue',
  ]) {
    input.pr.title = `${keyword} JOV-7300`;
    assert.deepEqual(
      evaluateSourceAdmission(input).blockers,
      ['linear-closing-reference:JOV-7300'],
      keyword
    );
  }
});
test('non-closing references and acceptance prose remain eligible', () => {
  for (const body of [
    '',
    null,
    'Refs JOV-7300.\nRelated to JOV-7070.\nContributes to JOV-7386.',
    'Related to JOV-7300. Verify runtime before declaring commissioning complete.',
    'JOV-7300 remains open. Complete the source repair and verify runtime.',
    'Fixes CVE-2026-1234. Refs JOV-7300.',
  ]) {
    const input = fixture();
    input.pr.body = body;
    assert.equal(evaluateSourceAdmission(input).allowed, true);
  }
});
test('every mechanical hold blocks and removing it restores eligibility', () => {
  for (const name of [
    'hold',
    'gated',
    'incident',
    'queue-deferred',
    'needs-conflict-resolution',
    'fast',
  ]) {
    const input = fixture();
    input.pr.labels = [{ name }];
    assert.deepEqual(evaluateSourceAdmission(input).blockers, [`hold:${name}`]);
    input.pr.labels = [];
    assert.equal(evaluateSourceAdmission(input).allowed, true);
  }
});
test('draft closed conflicting wrong-base and stale heads block', () => {
  for (const [
    mutate,
    reason,
  ] of /** @type {Array<[(pr: ReturnType<typeof fixture>["pr"]) => void, string]>} */ ([
    [
      pr => {
        pr.draft = true;
      },
      'draft',
    ],
    [
      pr => {
        pr.state = 'closed';
      },
      'closed',
    ],
    [
      pr => {
        pr.mergeable = false;
      },
      'conflict',
    ],
    [
      pr => {
        pr.base.ref = 'development';
      },
      'wrong-base',
    ],
    [
      pr => {
        pr.head.sha = other;
      },
      'stale-head',
    ],
  ])) {
    const input = fixture();
    mutate(input.pr);
    assert.ok(evaluateSourceAdmission(input).blockers.includes(reason));
  }
});
test('missing and incomplete evidence fails closed', () => {
  for (const key of [
    'pr',
    'files',
    'reviews',
    'statuses',
    'complete',
    'expectedHead',
    'repository',
  ]) {
    const input = fixture();
    delete input[key];
    assert.equal(evaluateSourceAdmission(input).allowed, false);
  }
  const input = fixture();
  input.pr.changed_files = 2;
  assert.equal(evaluateSourceAdmission(input).allowed, false);
  for (const key of ['title', 'body']) {
    const incomplete = fixture();
    delete incomplete.pr[key];
    assert.deepEqual(evaluateSourceAdmission(incomplete).blockers, [
      'incomplete-evidence',
    ]);
  }
});
test('latest opinionated reviewer state controls current-head change requests', () => {
  const input = fixture();
  input.reviews = [review('CHANGES_REQUESTED')];
  assert.deepEqual(evaluateSourceAdmission(input).blockers, [
    'changes-requested:reviewer',
  ]);
  input.reviews.push(review('COMMENTED', 2));
  assert.equal(evaluateSourceAdmission(input).allowed, false);
  input.reviews.push(review('APPROVED', 3));
  assert.equal(evaluateSourceAdmission(input).allowed, true);
  input.reviews = [review('CHANGES_REQUESTED', 1, { commit_id: other })];
  assert.equal(evaluateSourceAdmission(input).allowed, true);
  input.reviews = [review('CHANGES_REQUESTED', 1, { submitted_at: 'invalid' })];
  assert.equal(evaluateSourceAdmission(input).allowed, false);
});
test('fork approval must be current human collaborator latest opinionated state', () => {
  const input = fixture();
  input.pr.head.repo.fork = true;
  assert.ok(
    evaluateSourceAdmission(input).blockers.includes('fork-approval-required')
  );
  input.reviews = [review('APPROVED')];
  assert.equal(evaluateSourceAdmission(input).allowed, true);
  for (const extra of [
    { commit_id: other },
    { user: { login: 'bot', type: 'Bot' } },
    { author_association: 'NONE' },
  ]) {
    input.reviews = [review('APPROVED', 1, extra)];
    assert.equal(evaluateSourceAdmission(input).allowed, false);
  }
  input.reviews = [review('APPROVED'), review('DISMISSED', 2)];
  assert.equal(evaluateSourceAdmission(input).allowed, false);
});
test('generic admission preserves base holds and their provenance after main moves', () => {
  const input = fixture();
  const recorded = 'a'.repeat(40);
  input.statuses = [tombstone('jovie-queue-failure-hold/v1')];
  input.statuses[0].description = `class=base-branch;n=1;run=123;try=1;main=${recorded}`;
  assert.ok(
    evaluateSourceAdmission(input).blockers.includes(
      'tombstone:jovie-queue-failure-hold/v1'
    )
  );
  input.currentMainSha = recorded;
  assert.equal(evaluateSourceAdmission(input).allowed, false);
  input.currentMainSha = 'b'.repeat(40);
  assert.equal(evaluateSourceAdmission(input).allowed, false);
  for (const currentMainSha of ['', 'invalid', 'b'.repeat(40)]) {
    input.currentMainSha = currentMainSha;
    assert.equal(evaluateSourceAdmission(input).allowed, false);
  }
  input.statuses[0].creator = null;
  assert.ok(
    evaluateSourceAdmission(input).blockers.includes(
      'tombstone-provenance-unavailable'
    )
  );
  input.statuses[0].creator = { type: 'Bot', login: 'jovie-bot[bot]' };
  input.statuses[0].target_url =
    'https://github.com/JovieInc/Jovie/actions/runs/999';
  assert.ok(
    evaluateSourceAdmission(input).blockers.includes(
      'tombstone-provenance-unavailable'
    )
  );
});
test('pre-land changelog collision preserves existing release branch exception', () => {
  const input = fixture();
  input.files = [{ filename: 'CHANGELOG.md' }];
  assert.ok(
    evaluateSourceAdmission(input).blockers.includes('pre-land-changelog')
  );
});
test('every trusted exact-head tombstone blocks even with later success; spoofed unrelated actors do not', () => {
  for (const context of [
    'jovie-queue-failure-hold/v1',
    'jovie-queue-product-failure/v1',
    'jovie-native-unmergeable/v1',
  ]) {
    const input = fixture();
    input.statuses = [
      tombstone(context),
      { context: 'optional', state: 'success' },
    ];
    assert.ok(
      evaluateSourceAdmission(input).blockers.includes(`tombstone:${context}`)
    );
    input.statuses[0].creator = { type: 'User', login: 'attacker' };
    assert.equal(evaluateSourceAdmission(input).allowed, true);
    input.statuses[0].creator = null;
    assert.equal(evaluateSourceAdmission(input).allowed, false);
    input.statuses = [tombstone(context)];
    input.statuses[0].target_url =
      'https://github.com/other/repo/actions/runs/123';
    assert.equal(evaluateSourceAdmission(input).allowed, false);
  }
});
/**
 * @param {ReturnType<typeof fixture>} input
 * @param {(path: string, response: {data: unknown, link: string | null}, calls: {path: string, options: object}[]) => void} [change]
 */
function requester(input, change = () => {}) {
  const calls = [];
  const request = async (path, options) => {
    calls.push({ path, options });
    const data = path.includes('/files?')
      ? input.files
      : path.includes('/reviews?')
        ? input.reviews
        : path.includes('/statuses?')
          ? input.statuses
          : input.pr;
    const response = { data: structuredClone(data), link: null };
    change(path, response, calls);
    return response;
  };
  return { calls, request };
}
const args = {
  repository,
  prNumber: 7,
  expectedHead: head,
  token: 'test-token',
  deadlineMs: 12345,
};
test('runtime fetch pins status endpoint, preserves deadline and rechecks metadata after pages', async () => {
  const mock = requester(fixture());
  const result = await runSourceAdmission({ ...args, request: mock.request });
  assert.equal(result.allowed, true);
  assert.equal(mock.calls.length, 5);
  assert.ok(
    mock.calls.some(call => call.path.includes(`/commits/${head}/statuses`))
  );
  assert.ok(mock.calls.every(call => call.options.deadlineMs === 12345));
  assert.equal(mock.calls.at(-1).path, '/repos/JovieInc/Jovie/pulls/7');
});
test('late hold blocks and concurrent push cannot inherit earlier evidence', async () => {
  for (const mutate of [
    pr => {
      pr.labels = [{ name: 'hold' }];
    },
    pr => {
      pr.head.sha = other;
    },
  ]) {
    const mock = requester(fixture(), (path, response, calls) => {
      if (calls.length === 5) mutate(response.data);
    });
    if (mutate.toString().includes('head.sha'))
      await assert.rejects(
        runSourceAdmission({ ...args, request: mock.request }),
        /head changed/
      );
    else
      assert.equal(
        (await runSourceAdmission({ ...args, request: mock.request })).allowed,
        false
      );
  }
});
test('admission checks the final PR text even without a source push', async () => {
  const mock = requester(fixture(), (_path, response, calls) => {
    if (calls.length === 5) {
      /** @type {ReturnType<typeof fixture>['pr']} */ (response.data).body =
        'Related to JOV-7300. Do not complete JOV-7300.';
    }
  });
  const result = await runSourceAdmission({ ...args, request: mock.request });
  assert.deepEqual(result.blockers, ['linear-closing-reference:JOV-7300']);
});
test('pagination includes later-page review and fails closed on cap or malformed evidence', async () => {
  const mock = requester(fixture(), (path, response) => {
    if (path.includes('/reviews?')) {
      if (path.endsWith('page=1')) response.link = '<next>; rel="next"';
      else response.data = [review('CHANGES_REQUESTED')];
    }
  });
  assert.equal(
    (await runSourceAdmission({ ...args, request: mock.request })).allowed,
    false
  );
  for (const alteration of [
    response => {
      response.link = '<next>; rel="next"';
    },
    response => {
      response.data = {};
    },
  ]) {
    const broken = requester(fixture(), (path, response) => {
      if (path.includes('/statuses?')) alteration(response);
    });
    await assert.rejects(
      runSourceAdmission({ ...args, request: broken.request }),
      /pagination|paginated/
    );
  }
});
test('missing token, HTTP failure and partial file response are never approval', async () => {
  await assert.rejects(runSourceAdmission({ ...args, token: '' }), /required/);
  await assert.rejects(
    runSourceAdmission({
      ...args,
      request: async () => {
        throw new Error('HTTP 403');
      },
    }),
    /403/
  );
  const input = fixture();
  input.pr.changed_files = 2;
  const mock = requester(input);
  assert.equal(
    (await runSourceAdmission({ ...args, request: mock.request })).allowed,
    false
  );
});

test('CLI missing credentials emits an actionable fail-closed JSON receipt', () => {
  const child = spawnSync(
    process.execPath,
    [
      'scripts/lib/source-admission-policy.mjs',
      '--repo',
      repository,
      '--pr',
      '7',
      '--head',
      head,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, GH_TOKEN: '', GITHUB_TOKEN: '' },
    }
  );
  assert.equal(child.status, 1);
  const receipt = JSON.parse(child.stdout);
  assert.equal(receipt.allowed, false);
  assert.deepEqual(receipt.blockers, ['evidence-unavailable']);
});

test('authoring CLI validates a body file and title without credentials or publication', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jovie-linear-reference-'));
  const file = join(dir, 'body.md');
  const invoke = (title, equals = false) =>
    spawnSync(
      process.execPath,
      [
        'scripts/lib/source-admission-policy.mjs',
        ...(equals ? [`--body-file=${file}`] : ['--body-file', file]),
        ...(title ? (equals ? [`--title=${title}`] : ['--title', title]) : []),
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, GH_TOKEN: '', GITHUB_TOKEN: '' },
      }
    );
  try {
    writeFileSync(file, 'Related to JOV-7300. Verify before closing JOV-7300.');
    const rejected = invoke('fix(automation): preserve acceptance');
    assert.equal(rejected.status, 1);
    assert.deepEqual(JSON.parse(rejected.stdout).blockers, [
      'linear-closing-reference:JOV-7300',
    ]);
    writeFileSync(
      file,
      'Related to JOV-7300. Verify before declaring commissioning complete.'
    );
    const accepted = invoke('fix(automation): preserve acceptance');
    assert.equal(accepted.status, 0);
    assert.equal(JSON.parse(accepted.stdout).allowed, true);
    assert.equal(invoke('Fixes JOV-7300').status, 1);
    assert.equal(invoke(null).status, 1);
    const equalsAccepted = invoke('fix(automation): preserve acceptance', true);
    assert.equal(equalsAccepted.status, 0);
    assert.equal(JSON.parse(equalsAccepted.stdout).allowed, true);
    const equalsRejected = invoke('Fixes JOV-7300', true);
    assert.equal(equalsRejected.status, 1);
    assert.deepEqual(JSON.parse(equalsRejected.stdout).blockers, [
      'linear-closing-reference:JOV-7300',
    ]);
    assert.equal(invoke(null, true).status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('trusted context guard works for old heads and still rejects oversized merged context', () => {
  const workflow = load(
    readFileSync('.github/workflows/source-validation.yml', 'utf8')
  );
  const script = workflow.jobs.deterministic.steps
    .find(
      step => step.name === 'Check agent-context size after merge onto base'
    )
    .run.replace(/\$\{\{\s*github.base_ref\s*\}\}/g, 'main');
  const root = mkdtempSync(join(tmpdir(), 'source-context-bootstrap-'));
  const repo = join(root, 'repo');
  const bin = join(root, 'bin');
  const runner = join(root, 'runner');
  for (const dir of [
    repo,
    bin,
    runner,
    join(repo, 'scripts/agent-context'),
    join(repo, 'docs/agent-context'),
  ])
    mkdirSync(dir, { recursive: true });
  const git = (...args) =>
    execFileSync('/usr/bin/git', args, { cwd: repo, encoding: 'utf8' }).trim();
  try {
    for (const name of ['check.mjs', 'merge-budget.mjs'])
      writeFileSync(
        join(repo, 'scripts/agent-context', name),
        readFileSync(`scripts/agent-context/${name}`)
      );
    writeFileSync(join(repo, 'CLAUDE.md'), 'small context\n');
    writeFileSync(join(repo, 'DESIGN.md'), 'small design\n');
    writeFileSync(join(repo, 'docs/agent-context/README.md'), 'small index\n');
    git('init', '--quiet');
    git('config', 'user.name', 'Context guard test');
    git('config', 'user.email', 'context@example.invalid');
    git('add', '.');
    git('commit', '--quiet', '-m', 'trusted guard');
    git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
    rmSync(join(repo, 'scripts'), { recursive: true });
    writeFileSync(join(repo, 'notes.txt'), 'older source head\n');
    git('add', '--all');
    git('commit', '--quiet', '-m', 'old head without guard');
    writeFileSync(
      join(bin, 'git'),
      '#!/bin/sh\nif [ "$1" = fetch ]; then exit 0; fi\nexec /usr/bin/git "$@"\n',
      { mode: 0o755 }
    );
    const invoke = () =>
      spawnSync('bash', ['-c', script], {
        cwd: repo,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          RUNNER_TEMP: runner,
          EXPECTED_HEAD: git('rev-parse', 'HEAD'),
        },
      });
    const oldHead = invoke();
    assert.equal(oldHead.status, 0, oldHead.stderr);
    assert.match(oldHead.stdout, /post-merge size check skipped/);
    writeFileSync(join(repo, 'CLAUDE.md'), 'x'.repeat(6001));
    git('add', 'CLAUDE.md');
    git('commit', '--quiet', '-m', 'oversized context');
    const oversized = invoke();
    assert.equal(oversized.status, 1);
    assert.match(oversized.stderr, /CLAUDE\.md: 6001 bytes exceeds 6000/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Metadata-only edits reuse the newest exact-head proof (ci-eff, 2026-10-04):
// 262 of 303 same-head Source Validation reruns in 24h were PR body edits.
function sourceValidationWorkflow() {
  return load(readFileSync('.github/workflows/source-validation.yml', 'utf8'));
}

function runProofReuse({ runs, ghFails = false, sha = 'a'.repeat(40) }) {
  const step = sourceValidationWorkflow().jobs.deterministic.steps.find(
    candidate => candidate.id === 'reuse'
  );
  const root = mkdtempSync(join(tmpdir(), 'source-proof-reuse-'));
  try {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    writeFileSync(
      join(root, 'runs.json'),
      JSON.stringify({ workflow_runs: runs })
    );
    writeFileSync(
      join(bin, 'gh'),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${root}/gh.log"\n${ghFails ? 'exit 1' : `cat "${root}/runs.json"`}\n`,
      { mode: 0o755 }
    );
    const output = join(root, 'output');
    writeFileSync(output, '');
    const result = spawnSync('bash', ['-c', step.run], {
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        GITHUB_OUTPUT: output,
        GH_TOKEN: 'test',
        HEAD_SHA: sha,
        HEAD_REF: 'agent/jov-1',
        REPOSITORY: 'JovieInc/Jovie',
        RUN_ID: '500',
      },
    });
    let ghLog = '';
    try {
      ghLog = readFileSync(join(root, 'gh.log'), 'utf8');
    } catch {}
    return {
      status: result.status,
      stderr: result.stderr,
      output: readFileSync(output, 'utf8'),
      ghLog,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const proofRun = (id, conclusion, overrides = {}) => ({
  id,
  conclusion,
  head_sha: 'a'.repeat(40),
  head_branch: 'agent/jov-1',
  path: '.github/workflows/source-validation.yml',
  ...overrides,
});

test('a metadata-only edit reuses the newest green exact-head proof', () => {
  const result = runProofReuse({
    runs: [
      proofRun(300, 'success'),
      proofRun(400, 'success'),
      proofRun(900, 'success'),
    ],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, 'reuse=true\nproof_run=400\n');
  assert.match(
    result.ghLog,
    /head_sha=a{40}&event=pull_request&status=completed/
  );
});

test('a red, foreign, or unreadable predecessor runs the full source contract', () => {
  /** @type {[string, { runs: object[], ghFails?: boolean, sha?: string }][]} */
  const cases = [
    [
      'newest predecessor failed',
      { runs: [proofRun(300, 'success'), proofRun(400, 'failure')] },
    ],
    [
      'newest predecessor cancelled',
      { runs: [proofRun(300, 'success'), proofRun(400, 'cancelled')] },
    ],
    [
      'other branch',
      { runs: [proofRun(400, 'success', { head_branch: 'other' })] },
    ],
    [
      'other workflow',
      {
        runs: [proofRun(400, 'success', { path: '.github/workflows/ci.yml' })],
      },
    ],
    ['no predecessor', { runs: [] }],
    [
      'run list unreadable',
      { runs: [proofRun(400, 'success')], ghFails: true },
    ],
    ['malformed head', { runs: [proofRun(400, 'success')], sha: 'short' }],
  ];
  for (const [name, input] of cases) {
    const result = runProofReuse(input);
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    assert.match(result.output, /^reuse=false\n/, name);
  }
});

test('reuse skips every proof step except body-dependent and exact-head evidence', () => {
  const workflow = sourceValidationWorkflow();
  const gate = "steps.reuse.outputs.reuse != 'true'";
  const reuseStep = workflow.jobs.deterministic.steps[0];
  assert.equal(reuseStep.id, 'reuse');
  // Base retargets change the compared tree, so they never reuse a proof.
  assert.equal(
    reuseStep.if,
    "${{ github.event.action == 'edited' && !github.event.changes.base }}"
  );
  for (const job of ['security', 'migration', 'coverage']) {
    const [first, ...rest] = workflow.jobs[job].steps;
    assert.equal(first.id, 'reuse', job);
    assert.ok(workflow.jobs[job].permissions.actions === 'read', job);
    for (const step of rest)
      assert.equal(step.if, gate, `${job}: ${step.name ?? step.uses}`);
  }
  const always = [
    'Validate customer changelog decision from trusted base',
    'Measure actual installed source dependency graph',
    'Preserve exact source dependency evidence',
  ];
  const deterministic = workflow.jobs.deterministic.steps;
  for (const name of always) {
    const step = deterministic.find(candidate => candidate.name === name);
    assert.ok(step, name);
    assert.equal(
      step.if,
      undefined,
      `${name} must run on a metadata-only edit`
    );
  }
  assert.equal(
    deterministic.find(
      step => step.name === 'Run deterministic source contract'
    ).if,
    gate
  );
  assert.equal(
    workflow.jobs.ready.steps[0].run,
    'test "$RESULTS" = \'success,success,success,success\''
  );
});
