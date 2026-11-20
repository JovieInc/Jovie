import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { load } from 'js-yaml';
import { deriveSteps } from '../../preflight.mjs';
import { requiredContexts } from '../queue-parity.mjs';

const root = resolve(import.meta.dirname, '../../..');
const read = file => readFileSync(join(root, file), 'utf8');
/**
 * @typedef {{name?: string, id?: string, if?: string, run?: string, uses?: string,
 *   'continue-on-error'?: boolean, env?: Record<string, string>,
 *   with?: {ref?: string, path?: string, 'persist-credentials'?: boolean,
 *     'sparse-checkout'?: string, 'node-version-file'?: string}}} Step
 * @typedef {{on: Record<string, {types: string[], branches: string[]}>,
 *   permissions: Record<string, string>,
 *   concurrency: {group: string, 'cancel-in-progress': boolean, queue: string},
 *   jobs: Record<string, {name?: string, if?: string, 'runs-on'?: string,
 *     'continue-on-error'?: boolean,
 *     permissions?: Record<string, string>, needs?: string | string[],
 *     concurrency?: {'cancel-in-progress'?: boolean}, steps: Step[]}>}} Workflow
 */
const workflow = /** @type {Workflow} */ (
  load(read('.github/workflows/source-validation.yml'))
);
// Compare the original jobs with the actual base, including complete step objects.
const baseline = /** @type {Workflow} */ (
  load(
    execFileSync(
      'git',
      ['show', 'origin/main:.github/workflows/source-validation.yml'],
      {
        cwd: root,
        encoding: 'utf8',
      }
    )
  )
);
const cleanup = workflow.jobs['cancel-superseded'];
const cancelStep = cleanup.steps.find(
  step => step.name === 'Cancel only older runs of superseded PR heads'
);
const sha = 'a'.repeat(40);
const oldSha = 'b'.repeat(40);
const run = (id, overrides = {}) => ({
  id,
  head_sha: oldSha,
  head_branch: 'feature/test',
  head_repository: { full_name: 'JovieInc/Jovie' },
  event: 'pull_request',
  path: '.github/workflows/source-validation.yml',
  pull_requests: [{ number: 42 }],
  status: 'in_progress',
  ...overrides,
});

// Execute the workflow's actual shell with a deterministic API-client stand-in.
// No GitHub calls, credentials, real clock, or git mutations are needed.
function simulate(
  t,
  {
    pages = [{ workflow_runs: [run(1)] }],
    heads = [sha],
    failure = '',
    listFailure = false,
    runId = '100',
    ready = 'true',
  } = {}
) {
  const dir = mkdtempSync(join(tmpdir(), 'source-validation-dedup-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(dir, 'fixture.json'),
    JSON.stringify({ pages, heads, failure, listFailure })
  );
  writeFileSync(
    join(bin, 'node'),
    `#!${process.execPath}
const fs = require('node:fs');
const f = JSON.parse(fs.readFileSync('fixture.json', 'utf8'));
const args = process.argv.slice(2);
const prefix = ['.source-validation-client/packages/api-client/cli.ts', 'gh', '--priority', 'repair', '--once', '--', 'api'];
if (JSON.stringify(args.slice(0, prefix.length)) !== JSON.stringify(prefix)) process.exit(98);
const call = args.slice(prefix.length);
fs.appendFileSync('calls.jsonl', JSON.stringify(call) + '\\n');
if (call[0] === '--method') {
  if (f.failure) { process.stderr.write(f.failure); process.exit(1); }
} else if (call[0] === 'repos/JovieInc/Jovie/pulls/42') {
  const count = fs.existsSync('reads') ? Number(fs.readFileSync('reads', 'utf8')) : 0;
  fs.writeFileSync('reads', String(count + 1));
  const head = f.heads[Math.min(count, f.heads.length - 1)];
  if (head === 'ERROR') process.exit(75);
  process.stdout.write(head);
} else if (call[0] === 'repos/JovieInc/Jovie/actions/workflows/source-validation.yml/runs?event=pull_request&branch=feature%2Ftest&per_page=100'
  && call[1] === '--paginate' && call[2] === '--slurp') {
  if (f.listFailure) process.exit(75);
  process.stdout.write(JSON.stringify(f.pages));
} else process.exit(99);
`,
    { mode: 0o755 }
  );
  const result = spawnSync('bash', ['-c', cancelStep.run], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      CLEANUP_READY: ready,
      HEAD_SHA: sha,
      HEAD_REF: 'feature/test',
      PR_NUMBER: '42',
      REPOSITORY: 'JovieInc/Jovie',
      RUN_ID: runId,
    },
  });
  assert.ifError(result.error);
  const calls = existsSync(join(dir, 'calls.jsonl'))
    ? readFileSync(join(dir, 'calls.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line))
    : [];
  return {
    ...result,
    calls,
    cancelled: calls
      .filter(args => args[0] === '--method')
      .map(args => Number(args[2].split('/').at(-2))),
  };
}

test('cancellation is isolated from every original source job and required check', () => {
  assert.equal(workflow.permissions.actions, undefined);
  assert.deepEqual(cleanup.permissions, {
    actions: 'write',
    contents: 'read',
    'pull-requests': 'read',
  });
  assert.deepEqual(
    Object.entries(workflow.jobs)
      .filter(([, job]) => job.permissions?.actions === 'write')
      .map(([id]) => id),
    ['cancel-superseded']
  );
  assert.equal(
    cleanup.if,
    "${{ github.event_name == 'pull_request' && github.event.action == 'synchronize' && github.event.pull_request.head.repo.full_name == github.repository && github.actor != 'dependabot[bot]' }}"
  );
  assert.equal(cleanup.needs, undefined);
  assert.equal(cleanup['continue-on-error'], undefined);
  assert.equal(cleanup.name, 'Source Validation / cancel superseded heads');
  const reservedNames = new Set([
    ...requiredContexts(root),
    ...Object.entries(baseline.jobs)
      .filter(([id]) => id !== 'cancel-superseded')
      .map(([, job]) => job.name),
  ]);
  assert.ok(!reservedNames.has(cleanup.name));
  for (const job of Object.values(workflow.jobs)) {
    const needs = Array.isArray(job.needs) ? job.needs : [job.needs];
    assert.ok(!needs.includes('cancel-superseded'));
  }
  assert.equal(cleanup.steps.length, 4);
  assert.equal(cleanup.steps.indexOf(cancelStep), 3);
  assert.deepEqual(
    cleanup.steps.map(step => step.uses ?? 'shell'),
    [
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
      'shell',
      'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1',
      'shell',
    ]
  );
  const checkout = cleanup.steps[0];
  assert.equal(checkout.with.ref, '${{ github.event.pull_request.base.sha }}');
  assert.equal(checkout.with['persist-credentials'], false);
  assert.equal(checkout.with.path, '.source-validation-client');
  assert.deepEqual(checkout.with['sparse-checkout'].trim().split('\n'), [
    '.nvmrc',
    'packages/api-client',
    '.github/actions/prime-node-toolcache/action.yml',
    '.github/actions/prime-node-toolcache/prime.sh',
  ]);
  assert.equal(
    cleanup.steps[1].run,
    'bash .source-validation-client/.github/actions/prime-node-toolcache/prime.sh'
  );
  assert.equal(
    cleanup.steps[2].with['node-version-file'],
    '.source-validation-client/.nvmrc'
  );
  assert.match(
    cancelStep.run,
    /packages\/api-client\/cli\.ts gh --priority repair --once/
  );
  // No PR checkout, dependency install, local PR action, or PR script can be added.
  for (const step of cleanup.steps) {
    assert.notEqual(
      step.with?.ref,
      '${{ github.event.pull_request.head.sha }}'
    );
    assert.doesNotMatch(
      step.run ?? '',
      /\b(?:pnpm|npm|npx|git)\b|github\.event\.pull_request\.head\.sha/
    );
  }
  assert.equal(workflow.jobs.deterministic.name, 'Source Validation');
  assert.equal(workflow.jobs.deterministic.permissions.actions, 'read');
  assert.deepEqual(workflow.concurrency, baseline.concurrency);
});

test('bootstrap failures skip cleanup with a notice and successful exit', t => {
  assert.equal(cancelStep.if, '${{ !cancelled() }}');
  assert.equal(cleanup.steps[1].if, "${{ steps.client.outcome == 'success' }}");
  assert.equal(cleanup.steps[2].if, "${{ steps.prime.outcome == 'success' }}");
  // No continue-on-error anywhere (gate-weakening-detector forbids it).
  for (const step of cleanup.steps)
    assert.equal(step['continue-on-error'], undefined);
  assert.equal(
    cancelStep.env.CLEANUP_READY,
    "${{ steps.client.outcome == 'success' && steps.prime.outcome == 'success' && steps.runtime.outcome == 'success' }}"
  );
  const result = simulate(t, { ready: 'false' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /::notice::.*bootstrap unavailable/);
  assert.deepEqual(result.calls, []);
});

test('only older superseded heads of this PR/workflow are cancelled, across pages and active states', t => {
  const rows = [
    ...['in_progress', 'queued', 'pending', 'waiting', 'requested'].map(
      (status, i) => run(i + 1, { status })
    ),
    run(6, { head_sha: sha }),
    run(100),
    run(101),
    run(7, { pull_requests: [{ number: 43 }] }),
    run(8, { pull_requests: [] }),
    run(9, { event: 'merge_group' }),
    run(10, { event: 'push' }),
    run(11, { path: '.github/workflows/ci.yml' }),
    run(12, { status: 'completed' }),
    run(13, { head_repository: { full_name: 'someone/Jovie' } }),
    run(14, { head_sha: '' }),
    run(15, { head_branch: 'main' }),
    run(16, { pull_requests: undefined }),
    run(18, { pull_requests: [{ number: 42 }, { number: 43 }] }),
    run(19, { head_sha: null }),
  ];
  const result = simulate(t, {
    pages: [{ workflow_runs: rows }, { workflow_runs: [run(17), run(1)] }],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.cancelled, [1, 2, 3, 4, 5, 17]);
  assert.equal(
    result.calls.filter(args => args[0].endsWith('/pulls/42')).length,
    7
  );
});

test('a stale synchronize event cannot cancel a newer head', t => {
  const result = simulate(t, { heads: [oldSha] });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.cancelled, []);
  assert.equal(result.calls.length, 1);
});

test('a push or head reversion during cleanup stops subsequent cancellations', t => {
  const result = simulate(t, {
    pages: [{ workflow_runs: [run(1), run(2)] }],
    heads: [sha, sha, oldSha],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.cancelled, [1]);
});

test('an unreadable live head cancels nothing and reports a nonblocking notice', t => {
  const result = simulate(t, { heads: [sha, 'ERROR'] });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /::notice::.*cleanup unavailable/);
  assert.deepEqual(result.cancelled, []);
});

test('invalid context, failed listing and malformed responses are nonblocking notices', t => {
  for (const fixture of [
    { heads: ['ERROR'] },
    { listFailure: true },
    { pages: [{ workflow_runs: null }] },
    { runId: 'not-a-run-id' },
  ]) {
    const result = simulate(t, fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /::notice::.*cleanup unavailable/);
    assert.deepEqual(result.cancelled, []);
  }
});

test('already-finished cancellation conflicts are benign; other API errors produce notices', t => {
  assert.equal(
    simulate(t, { failure: 'gh: Cannot cancel (HTTP 409)' }).status,
    0
  );
  const denied = simulate(t, { failure: 'gh: Forbidden (HTTP 403)' });
  assert.equal(denied.status, 0, denied.stderr);
  assert.match(denied.stdout, /::notice::.*cleanup unavailable/);
});

test('busy-hour cleanup has a bounded write budget', t => {
  const result = simulate(t, {
    pages: [
      { workflow_runs: Array.from({ length: 20 }, (_, i) => run(i + 1)) },
    ],
    runId: '1000',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.cancelled.length, 20);
  const selection = cancelStep.run.match(
    /ids="(\$\(jq[\s\S]+?<<<"\$runs"\))"/
  )[1];
  const selected = spawnSync('bash', ['-c', `printf '%s\\n' "${selection}"`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HEAD_SHA: sha,
      HEAD_REF: 'feature/test',
      REPOSITORY: 'JovieInc/Jovie',
      PR_NUMBER: '42',
      RUN_ID: '1000',
      runs: JSON.stringify([
        { workflow_runs: Array.from({ length: 120 }, (_, i) => run(i + 1)) },
      ]),
    },
  });
  assert.equal(selected.status, 0, selected.stderr);
  assert.equal(selected.stdout.trim().split('\n').length, 100);
  assert.ok(result.cancelled.every(id => id > 0 && id < 1000));
});

test('Source Validation only triggers on pull_request; merge_group and main pushes are excluded', () => {
  assert.deepEqual(Object.keys(workflow.on), ['pull_request']);
  assert.deepEqual(workflow.on.pull_request.branches, [
    'main',
    'integration/**',
  ]);
});

// Follow local actions, explicit script paths/imports and package script calls.
// Tests' own label fixtures are not policy consumers. This also catches label
// reads moved behind a helper rather than relying on the workflow text alone.
function reachableSources() {
  const pkg = JSON.parse(read('package.json'));
  const pending = ['.github/workflows/source-validation.yml'];
  const sources = new Map();
  while (pending.length) {
    const path = pending.pop();
    if (
      sources.has(path) ||
      /\.(?:test|spec)\./.test(path) ||
      (!path.startsWith('package.json#') &&
        (!existsSync(join(root, path)) || !statSync(join(root, path)).isFile()))
    )
      continue;
    const source = path.startsWith('package.json#')
      ? pkg.scripts[path.slice('package.json#'.length)]
      : read(path);
    sources.set(path, source);
    for (const [, file] of source.matchAll(
      /\b((?:scripts|packages|\.github)\/[\w./-]+\.(?:[cm]?[jt]s|sh|ya?ml))\b/g
    ))
      pending.push(file);
    for (const [, file] of source.matchAll(
      /(?:from\s*|import\s*\(\s*)['"](\.[^'"]+)['"]/g
    ))
      pending.push(resolve(root, dirname(path), file).slice(root.length + 1));
    for (const [, action] of source.matchAll(/uses:\s*\.\/([^\s]+)/g))
      pending.push(`${action}/action.yml`);
    for (const [, command] of source.matchAll(/pnpm\s+(?:run\s+)?([\w:-]+)/g)) {
      if (pkg.scripts[command]) pending.push(`package.json#${command}`);
    }
  }
  return sources;
}

test('label triggers exist iff reachable policy reads labels', () => {
  const readers = [...reachableSources()]
    .filter(([, source]) =>
      /github\.event\.label\b|(?:pull_request|pull|pr)\??\.labels\b|--json[^\n]*\blabels\b/.test(
        source
      )
    )
    .map(([path]) => path);
  assert.ok(
    readers.includes('scripts/security/security-gate.mjs'),
    `label audit: ${readers.join(', ')}`
  );
  for (const event of ['labeled', 'unlabeled'])
    assert.equal(
      workflow.on.pull_request.types.includes(event),
      readers.length > 0,
      readers.join(', ')
    );
});

test('metadata-only edits and label events still use the exact-head proof path in every source job', () => {
  const metadataIf =
    "${{ (github.event.action == 'edited' && !github.event.changes.base) || github.event.action == 'labeled' || github.event.action == 'unlabeled' }}";
  assert.ok(workflow.on.pull_request.types.includes('edited'));
  for (const id of [
    'deterministic',
    'security',
    'migration',
    'coverage',
    'unit',
    'a11y',
  ]) {
    const job = workflow.jobs[id];
    const index = job.steps.findIndex(step => step.id === 'reuse');
    assert.ok(index >= 0, id);
    const reuse = job.steps[index];
    assert.equal(reuse.name, 'Reuse exact-head proof for a metadata-only edit');
    assert.equal(reuse.if, metadataIf);
    assert.match(
      reuse.run,
      /head_sha=\$HEAD_SHA&event=pull_request&status=completed/
    );
    assert.match(reuse.run, /\.head_sha == \$sha/);
    assert.match(reuse.run, /\.conclusion == "success"/);
    assert.ok(
      job.steps
        .slice(index + 1)
        .some(step => step.if?.includes("steps.reuse.outputs.reuse != 'true'")),
      id
    );
    assert.equal(
      job.concurrency,
      undefined,
      'metadata reuse must not queue behind a job dependency'
    );
  }
});

test('all original jobs retain origin/main permissions, runners, steps and blocking behavior', () => {
  assert.deepEqual(
    Object.keys(workflow.jobs).filter(id => id !== 'cancel-superseded'),
    Object.keys(baseline.jobs).filter(id => id !== 'cancel-superseded')
  );
  for (const [id, job] of Object.entries(baseline.jobs)) {
    if (id === 'cancel-superseded') continue;
    assert.deepEqual(workflow.jobs[id], job, `${id} differs from origin/main`);
  }
  assert.equal(cleanup['runs-on'], baseline.jobs.deterministic['runs-on']);
  assert.deepEqual(workflow.permissions, baseline.permissions);
  assert.deepEqual(workflow.on, baseline.on);
});

test('local preflight never includes the independent CI cleanup job', () => {
  const planned = deriveSteps(read('.github/workflows/source-validation.yml'));
  for (const step of cleanup.steps)
    assert.ok(!planned.some(local => local.name === step.name), step.name);
});

test('PR Size Guard never opts into cancel-in-progress', () => {
  const sizeGuard = /** @type {Workflow} */ (
    load(read('.github/workflows/pr-size-guard.yml'))
  );
  assert.notEqual(sizeGuard.concurrency?.['cancel-in-progress'], true);
  for (const job of Object.values(sizeGuard.jobs))
    assert.notEqual(job.concurrency?.['cancel-in-progress'], true);
});
