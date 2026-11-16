import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  SCRIPT_CONTRACT_NODE_TESTS,
  SCRIPT_CONTRACT_VITEST_TESTS,
} from '../../scripts/ci-fast-lanes.mjs';
import {
  collectDependencyParity,
  compareDependencyDigests,
  readDigestArtifact,
  validateDependencyDigest,
  validateSourceDocsScope,
  writeDependencyDigest,
  writeSourceDocsScope,
} from './dependency-parity-evidence.mjs';

const sha = 'a'.repeat(40),
  base = 'b'.repeat(40),
  sourceHead = 'c'.repeat(40);
const resolved = { 'js-yaml': ['4.1.0'] };
const docsPath = 'docs/research/source-validation-fastpath-notes.md';
const hashPaths = paths =>
  createHash('sha256').update(JSON.stringify(paths)).digest('hex');
function fixtureGitEnvironment() {
  const environment = { ...process.env };
  for (const name of execFileSync('git', ['rev-parse', '--local-env-vars'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n'))
    if (name) delete environment[name];
  return environment;
}
function classifierFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'source-scope-policy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const trustedRoot = join(import.meta.dirname, '../..');
  for (const path of [
    '.github/ci-harness/manifest.json',
    'docs/doc-freshness-registry.json',
    'repository-docs.json',
    '.github/ci-harness/ci-release-incidents.json',
  ]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), readFileSync(join(trustedRoot, path)));
  }
  // Complete isolated consumer graph: fixture tests have no source reads.
  // The imported classifier suite covers the actual repository's readers.
  for (const path of [
    ...SCRIPT_CONTRACT_NODE_TESTS,
    ...SCRIPT_CONTRACT_VITEST_TESTS,
  ].flatMap(test => test.split(' '))) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(
      join(root, path),
      '// No source-file input in this fixture.\n'
    );
  }
  mkdirSync(join(root, 'apps/web/tests'), { recursive: true });
  return root;
}
function scope(overrides = {}) {
  const paths = overrides.paths ?? [docsPath];
  return {
    schema: 'jovie-source-docs-scope/v1',
    schemaVersion: 1,
    repository: 'JovieInc/Jovie',
    headSha: sourceHead,
    baseSha: base,
    prNumber: 123,
    runId: 8,
    runAttempt: 1,
    event: 'pull_request',
    generatedAt: '2026-10-03T10:00:00Z',
    paths,
    pathsDigest: hashPaths(paths),
    ...overrides,
  };
}
function digest(overrides = {}) {
  const values = overrides.resolved ?? resolved;
  return {
    schemaVersion: 1,
    repository: 'JovieInc/Jovie',
    headSha: sha,
    runId: 7,
    runAttempt: 2,
    event: 'merge_group',
    generatedAt: '2026-10-03T10:00:00Z',
    lockfileSha: 'a'.repeat(64),
    resolved: values,
    resolvedDigest: createHash('sha256')
      .update(JSON.stringify(values))
      .digest('hex'),
    ...overrides,
  };
}
/** @returns {any} */
function scopeFixture(root) {
  /** @type {any} */
  const f = fixture();
  f.pr.base = { ref: 'main', sha: base, repo: { full_name: 'JovieInc/Jovie' } };
  f.pr.changed_files = 1;
  f.scope = scope();
  f.artifact.name = `source-docs-scope-8-1-${sourceHead}`;
  f.artifacts = [f.artifact];
  f.sourceComparison = {
    status: 'ahead',
    behind_by: 0,
    base_commit: { sha: base },
    merge_base_commit: { sha: base },
    ahead_by: 1,
    total_commits: 1,
    commits: [{ sha: sourceHead }],
    files: [{ filename: docsPath, status: 'modified' }],
  };
  f.mainAncestry = {
    status: 'ahead',
    behind_by: 0,
    ahead_by: 1000,
    base_commit: { sha: base },
    merge_base_commit: { sha: base },
    // The long main range is intentionally not a complete commit listing.
    commits: [{ sha: 'f'.repeat(40) }],
    total_commits: 1000,
  };
  const api = f.input.api;
  f.input.api = path => {
    if (
      path === `repos/JovieInc/Jovie/compare/${f.scope.baseSha}...${sourceHead}`
    )
      return f.sourceComparison;
    if (
      path ===
      `repos/JovieInc/Jovie/compare/${f.scope.baseSha}...${f.pr.base.sha}`
    )
      return f.mainAncestry;
    if (path.includes('/actions/runs/8/artifacts?'))
      return { total_count: f.artifacts.length, artifacts: f.artifacts };
    return api(path);
  };
  f.input.download = () => f.scope;
  f.input.root = root;
  return f;
}
function fixture() {
  const event = {
    action: 'checks_requested',
    repository: { full_name: 'JovieInc/Jovie' },
    merge_group: {
      base_sha: base,
      head_sha: sha,
      base_ref: 'refs/heads/main',
      head_ref: 'refs/heads/gh-readonly-queue/main/pr-123-aaaa',
    },
  };
  const pr = {
    number: 123,
    state: 'open',
    base: { ref: 'main' },
    head: {
      sha: sourceHead,
      repo: { full_name: 'JovieInc/Jovie', fork: false },
    },
    labels: [],
  };
  const run = {
    id: 8,
    run_attempt: 1,
    event: 'pull_request',
    head_sha: sourceHead,
    path: '.github/workflows/source-validation.yml',
    name: 'Source Validation',
    status: 'completed',
    conclusion: 'success',
    repository: { full_name: 'JovieInc/Jovie' },
    head_repository: { full_name: 'JovieInc/Jovie' },
  };
  const artifact = {
    id: 9,
    expired: false,
    name: `dependency-digest-8-1-${sourceHead}`,
    workflow_run: { id: 8, head_sha: sourceHead },
  };
  const source = digest({
    headSha: sourceHead,
    runId: 8,
    runAttempt: 1,
    event: 'pull_request',
  });
  const comparison = {
    status: 'ahead',
    behind_by: 0,
    base_commit: { sha: base },
    merge_base_commit: { sha: base },
    ahead_by: 1,
    total_commits: 1,
    commits: [
      {
        sha,
        parents: [{ sha: base }],
        commit: {
          message: 'Feature (#123)',
          committer: { name: 'GitHub', email: 'noreply@github.com' },
          verification: { verified: true, reason: 'valid' },
        },
      },
    ],
  };
  const calls = [];
  const api = path => {
    calls.push(path);
    if (path.includes('/compare/')) return comparison;
    if (path.endsWith('/pulls/123')) return pr;
    if (path.includes('/actions/runs?'))
      return { total_count: 1, workflow_runs: [run] };
    if (path.includes('/actions/runs/8/artifacts?'))
      return { total_count: 1, artifacts: [artifact] };
    if (path.endsWith('/actions/runs/8')) return run;
    throw new Error('Unexpected fixture path');
  };
  return {
    input: { event, group: digest(), api, download: () => source },
    pr,
    run,
    artifact,
    source,
    comparison,
    calls,
  };
}

test('exact successful source run and attempt-bound artifact compare against actual group graph', () => {
  const f = fixture();
  const report = collectDependencyParity(f.input);
  assert.deepEqual(report.comparisons, [
    { prNumber: 123, sourceHeadSha: sourceHead, comparable: true },
  ]);
  assert.equal(f.calls.filter(path => path.endsWith('/pulls/123')).length, 2);
});

test('docs scope is independently verified and reports no installed source graph', t => {
  const f = scopeFixture(classifierFixture(t));
  const result = collectDependencyParity(f.input);
  assert.deepEqual(result.comparisons, [
    {
      prNumber: 123,
      sourceHeadSha: sourceHead,
      comparable: false,
      applicability: 'not-applicable',
      reason: 'source-docs-only-no-installed-graph',
    },
  ]);
  assert.ok(!Object.hasOwn(f.scope, 'resolved'));
  assert.equal(
    f.calls.filter(path => path.endsWith('/actions/runs/8')).length,
    2
  );
});

test('ordinary main advancement preserves an immutable docs proof, including a long main range', t => {
  const f = scopeFixture(classifierFixture(t));
  f.pr.base.sha = 'd'.repeat(40);
  const result = collectDependencyParity(f.input);
  assert.equal(result.comparisons[0].applicability, 'not-applicable');
  assert.equal(f.scope.baseSha, base);
  assert.equal(f.scope.headSha, sourceHead);
});

test('a PR-only intermediate proof base and rewritten main ancestry cannot authorize scope', t => {
  const root = classifierFixture(t);
  for (const mutation of [
    'pr-only-base',
    'rewritten-main',
    'retarget',
    'foreign-base',
    'reversed-range',
  ]) {
    const f = scopeFixture(root);
    f.pr.base.sha = 'd'.repeat(40);
    if (mutation === 'pr-only-base') {
      f.scope.baseSha = 'e'.repeat(40);
      f.sourceComparison.base_commit.sha = f.scope.baseSha;
      f.sourceComparison.merge_base_commit.sha = f.scope.baseSha;
      f.mainAncestry.base_commit.sha = f.scope.baseSha;
      f.mainAncestry.status = 'diverged';
      f.mainAncestry.behind_by = 1;
    }
    if (mutation === 'rewritten-main')
      f.mainAncestry.merge_base_commit.sha = 'e'.repeat(40);
    if (mutation === 'retarget') f.pr.base.ref = 'other';
    if (mutation === 'foreign-base') f.pr.base.repo.full_name = 'foreign/repo';
    if (mutation === 'reversed-range') f.mainAncestry.status = 'behind';
    assert.throws(
      () => collectDependencyParity(f.input),
      /ancestor|main|changed or is malformed/,
      mutation
    );
  }
});

test('mixed scope and installed sources still validate the actual combined graph', t => {
  const options = { root: classifierFixture(t) };
  const sources = [
    { prNumber: 123, scope: scope() },
    { prNumber: 124, digest: digest({ event: 'pull_request' }) },
  ];
  const report = compareDependencyDigests(digest(), sources, options);
  assert.equal(report.comparisons[0].applicability, 'not-applicable');
  assert.equal(report.comparisons[1].comparable, true);
  assert.throws(
    () =>
      compareDependencyDigests(
        digest({ resolved: { 'js-yaml': ['5.0.0'] } }),
        sources,
        options
      ),
    /#124 js-yaml/
  );
  assert.throws(
    () =>
      compareDependencyDigests(
        { ...digest(), resolved: {} },
        [{ prNumber: 123, scope: scope() }],
        options
      ),
    /installed dependency graph/
  );
  assert.throws(
    () =>
      compareDependencyDigests(
        digest(),
        [
          {
            prNumber: 123,
            scope: scope(),
            digest: digest({ event: 'pull_request' }),
          },
        ],
        options
      ),
    /missing or ambiguous/
  );
});

test('docs artifacts cannot replace identity, provenance or an installed graph', () => {
  for (const override of [
    { schema: 'jovie-ci-dependency-workspace/v1' },
    { repository: 'foreign/repo' },
    { headSha: 'main' },
    { baseSha: sourceHead },
    { prNumber: 0 },
    { runAttempt: 0 },
    { generatedAt: 'invalid' },
    { event: 'merge_group' },
    { paths: [] },
    { paths: [docsPath, docsPath] },
    { paths: ['docs/research/z-notes.md', docsPath] },
    { paths: ['../docs/research/notes.md'] },
    { pathsDigest: 'f'.repeat(64) },
    { paths: ['pnpm-lock.yaml'] },
    { resolved: { 'js-yaml': ['4.1.0'] } },
  ])
    assert.throws(
      () => validateSourceDocsScope(scope(override)),
      JSON.stringify(override)
    );
});

test('docs scope rejects ambiguous families, tampering and incomplete server diffs', t => {
  const root = classifierFixture(t);
  const mutations = [
    f => {
      f.artifacts.push({ ...f.artifact, id: 10 });
    },
    f => {
      f.artifacts.push({
        ...f.artifact,
        id: 10,
        name: `dependency-digest-8-1-${sourceHead}`,
      });
    },
    f => {
      f.artifact.name = `source-docs-scope-8-2-${sourceHead}`;
    },
    f => {
      f.artifact.expired = true;
    },
    f => {
      f.artifact.workflow_run.head_sha = base;
    },
    f => {
      f.scope.runAttempt = 2;
    },
    f => {
      f.scope.prNumber = 124;
    },
    f => {
      f.scope.baseSha = 'd'.repeat(40);
    },
    f => {
      f.pr.head.repo.fork = true;
    },
    f => {
      f.input.download = () => f.source;
    },
    f => {
      f.scope = scope({ paths: ['docs/research/other-notes.md'] });
    },
    f => {
      f.pr.changed_files = 2;
    },
    f => {
      f.sourceComparison.files = [];
    },
    f => {
      f.sourceComparison.files.push(f.sourceComparison.files[0]);
      f.pr.changed_files = 2;
    },
    f => {
      f.sourceComparison.files = Array.from({ length: 300 }, (_, i) => ({
        filename: `docs/research/note-${i}.md`,
        status: 'modified',
      }));
      f.pr.changed_files = 300;
    },
    f => {
      f.sourceComparison.base_commit.sha = sourceHead;
    },
    f => {
      f.sourceComparison.merge_base_commit.sha = 'd'.repeat(40);
    },
    f => {
      f.sourceComparison.commits[0].sha = sha;
    },
    f => {
      f.sourceComparison.total_commits = 251;
    },
    f => {
      f.sourceComparison.files[0].status = 'removed';
    },
    f => {
      f.sourceComparison.files[0].status = 'renamed';
    },
    f => {
      f.sourceComparison.files[0].previous_filename = 'apps/web/app/page.tsx';
    },
    f => {
      f.sourceComparison.files[0].filename = 'apps/web/app/page.tsx';
    },
    f => {
      f.sourceComparison.files[0].filename = '../docs/research/notes.md';
    },
    f => {
      f.run.pull_requests = [
        { number: 124, head: { sha: sourceHead }, base: { sha: base } },
      ];
    },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const f = scopeFixture(root);
    mutate(f);
    assert.throws(() => collectDependencyParity(f.input), `mutation ${index}`);
  }
});

test('a new attempt or in-flight source and main change cannot reuse a scope artifact', t => {
  const root = classifierFixture(t);
  for (const change of [
    'attempt',
    'run-state',
    'base',
    'head',
    'fork',
    'repository',
  ]) {
    const f = scopeFixture(root),
      api = f.input.api;
    if (change === 'base') f.pr.base.sha = 'd'.repeat(40);
    let runReads = 0,
      prReads = 0;
    f.input.api = path => {
      const result = api(path);
      if (path.endsWith('/actions/runs/8') && ++runReads === 2) {
        if (change === 'attempt') return { ...result, run_attempt: 2 };
        if (change === 'run-state')
          return { ...result, status: 'in_progress', conclusion: null };
      }
      if (path.endsWith('/pulls/123') && ++prReads === 2) {
        const latest = structuredClone(result);
        if (change === 'base') latest.base.sha = 'e'.repeat(40);
        if (change === 'head') latest.head.sha = 'd'.repeat(40);
        if (change === 'fork') latest.head.repo.fork = true;
        if (change === 'repository')
          latest.head.repo.full_name = 'foreign/repo';
        return latest;
      }
      return result;
    };
    assert.throws(
      () => collectDependencyParity(f.input),
      /changed|Unbound/,
      change
    );
  }
  const f = fixture(),
    api = f.input.api;
  let reads = 0;
  f.input.api = path =>
    path.endsWith('/actions/runs/8') && ++reads === 2
      ? { ...f.run, run_attempt: 2 }
      : api(path);
  assert.throws(() => collectDependencyParity(f.input), /changed attempt/);
});

test('identical lockfiles cannot hide installed js-yaml 4/5 drift', () => {
  const f = fixture();
  f.input.group = digest({ resolved: { 'js-yaml': ['5.0.0'] } });
  assert.throws(
    () => collectDependencyParity(f.input),
    /#123 js-yaml: source=\["4.1.0"\] group=\["5.0.0"\]/
  );
  f.input.group = digest({ resolved: { other: ['1.0.0'] } });
  assert.throws(
    () => collectDependencyParity(f.input),
    /DEPENDENCY PARITY MISMATCH/
  );
});

test('intentional combined lockfile changes are explicitly non-comparable', () => {
  const result = compareDependencyDigests(
    digest({ lockfileSha: 'b'.repeat(64), resolved: { 'js-yaml': ['5.0.0'] } }),
    [{ prNumber: 123, digest: digest({ event: 'pull_request' }) }]
  );
  assert.equal(result.comparisons[0].comparable, false);
  assert.equal(result.comparisons[0].reason, 'combined-lockfile-differs');
});

test('foreign, stale, expired, missing and ambiguous evidence cannot establish parity', () => {
  for (const mutate of [
    f => {
      f.pr.head.repo.full_name = 'foreign/repo';
    },
    f => {
      f.run.event = 'push';
    },
    f => {
      f.run.head_sha = base;
    },
    f => {
      f.run.repository.full_name = 'foreign/repo';
    },
    f => {
      f.run.path = '.github/workflows/other.yml';
    },
    f => {
      f.run.conclusion = 'failure';
    },
    f => {
      f.artifact.expired = true;
    },
    f => {
      f.artifact.workflow_run.head_sha = base;
    },
    f => {
      f.artifact.name = 'unbound';
    },
    f => {
      f.source.runAttempt = 2;
    },
    f => {
      f.source.headSha = base;
    },
    f => {
      f.comparison.total_commits = 2;
    },
    f => {
      f.input.group.headSha = base;
    },
    f => {
      f.input.download = () => {
        throw new Error('missing artifact');
      };
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(() => collectDependencyParity(f.input));
  }
  const f = fixture(),
    api = f.input.api;
  let reads = 0;
  f.input.api = path => {
    if (path.endsWith('/pulls/123') && ++reads === 2)
      return { ...f.pr, head: { sha: base } };
    return api(path);
  };
  assert.throws(() => collectDependencyParity(f.input), /source changed/);
});

test('malformed graph hashes, receipts and incomplete member collections fail closed', () => {
  for (const override of [
    { resolvedDigest: 'b'.repeat(64) },
    { repository: 'foreign/repo' },
    { resolved: {} },
    { resolved: { pkg: ['invalid'] } },
    { runAttempt: 0 },
    { headSha: 'main' },
    { event: 'push' },
  ])
    assert.throws(() => validateDependencyDigest(digest(override)));
  assert.throws(() => compareDependencyDigests(digest(), []));
  assert.throws(
    () =>
      compareDependencyDigests(
        digest(),
        [1, 1].map(prNumber => ({
          prNumber,
          digest: digest({ event: 'pull_request' }),
        }))
      ),
    /Duplicate/
  );
});

test('writer measures installed package bytes rather than declared versions and binds real git HEAD', () => {
  const root = mkdtempSync(join(tmpdir(), 'dependency-writer-test-')),
    receipts = mkdtempSync(join(tmpdir(), 'dependency-receipt-test-')),
    oldCwd = process.cwd();
  try {
    const installed = join(root, 'node_modules', 'js-yaml');
    mkdirSync(installed, { recursive: true });
    writeFileSync(
      join(installed, 'package.json'),
      JSON.stringify({ name: 'js-yaml', version: '4.1.0' })
    );
    writeFileSync(
      join(root, 'pnpm-lock.yaml'),
      'packages:\n  js-yaml@5.0.0:\n'
    );
    const gitEnvironment = fixtureGitEnvironment();
    const git = args =>
      execFileSync('git', ['-C', root, ...args], {
        encoding: 'utf8',
        env: gitEnvironment,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    git(['init', '--quiet']);
    git(['add', 'pnpm-lock.yaml']);
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
    const headSha = git(['rev-parse', 'HEAD']);
    const eventPath = join(root, 'event.json');
    writeFileSync(
      eventPath,
      JSON.stringify({ pull_request: { head: { sha: headSha } } })
    );
    process.chdir(root);
    const environment = {
      GITHUB_REPOSITORY: 'JovieInc/Jovie',
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_RUN_ID: '123',
      GITHUB_RUN_ATTEMPT: '2',
      DEPENDENCY_PARITY_RECEIPT_DIR: receipts,
    };
    const execute = (command, args, options) =>
      command === 'pnpm'
        ? JSON.stringify([
            {
              dependencies: {
                'js-yaml': { path: installed, version: '5.0.0' },
              },
            },
          ])
        : execFileSync(command, args, { ...options, env: gitEnvironment });
    const value = writeDependencyDigest(environment, execute);
    assert.deepEqual(value.resolved, { 'js-yaml': ['4.1.0'] });
    assert.equal(value.headSha, headSha);
    assert.equal(value.runAttempt, 2);
    assert.equal(
      JSON.parse(readFileSync(join(receipts, 'dep-digest.json'), 'utf8'))
        .resolvedDigest,
      value.resolvedDigest
    );
    assert.ok(!existsSync(join(root, 'dep-digest.json')));
    assert.throws(() => writeDependencyDigest(environment, execute), /EEXIST/);
    writeFileSync(
      eventPath,
      JSON.stringify({ pull_request: { head: { sha } } })
    );
    assert.throws(
      () => writeDependencyDigest(environment, execute),
      /source mismatch/
    );
    assert.throws(
      () =>
        writeDependencyDigest(
          { ...environment, GITHUB_REPOSITORY: 'foreign/repo' },
          execute
        ),
      /repository/
    );
  } finally {
    process.chdir(oldCwd);
    rmSync(root, { recursive: true, force: true });
    rmSync(receipts, { recursive: true, force: true });
  }
});

test('artifact reader streams only the bounded digest member and never extracts archive paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'dependency-archive-test-'));
  try {
    writeFileSync(join(root, 'dep-digest.json'), JSON.stringify(digest()));
    const zip = join(root, 'valid.zip');
    execFileSync('zip', ['-q', zip, 'dep-digest.json'], { cwd: root });
    const download = () => readFileSync(zip);
    assert.equal(readDigestArtifact({ id: 9 }, download).headSha, sha);
    writeFileSync(join(root, 'other.txt'), 'foreign');
    execFileSync('zip', ['-q', zip, 'other.txt'], { cwd: root });
    assert.throws(
      () => readDigestArtifact({ id: 9 }, download),
      /Unexpected dependency archive/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function scopeWriterFixture(t) {
  const root = classifierFixture(t);
  const receipts = mkdtempSync(join(tmpdir(), 'source-scope-receipts-'));
  t.after(() => rmSync(receipts, { recursive: true, force: true }));
  mkdirSync(join(root, 'docs/research'), { recursive: true });
  const gitEnvironment = fixtureGitEnvironment();
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      env: gitEnvironment,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Scope fixture');
  git('config', 'user.email', 'scope@example.invalid');
  writeFileSync(join(root, docsPath), 'Initial research.\n');
  git('add', docsPath);
  git('commit', '-qm', 'base prose');
  const baseSha = git('rev-parse', 'HEAD');
  writeFileSync(join(root, docsPath), 'Measured research.\n');
  git('add', docsPath);
  git('commit', '-qm', 'changed prose');
  const headSha = git('rev-parse', 'HEAD');
  const event = {
    number: 123,
    repository: { full_name: 'JovieInc/Jovie' },
    pull_request: {
      number: 123,
      head: {
        sha: headSha,
        repo: { full_name: 'JovieInc/Jovie', fork: false },
      },
      base: {
        ref: 'main',
        sha: baseSha,
        repo: { full_name: 'JovieInc/Jovie' },
      },
    },
  };
  const eventPath = join(root, 'event.json');
  const environment = {
    ...gitEnvironment,
    GITHUB_REPOSITORY: 'JovieInc/Jovie',
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_WORKSPACE: root,
    GITHUB_RUN_ID: '8',
    GITHUB_RUN_ATTEMPT: '1',
    DEPENDENCY_PARITY_RECEIPT_DIR: receipts,
  };
  const writeEvent = () => writeFileSync(eventPath, JSON.stringify(event));
  writeEvent();
  return {
    root,
    receipts,
    git,
    baseSha,
    headSha,
    event,
    environment,
    writeEvent,
  };
}

test('native write-scope binds exact event and real git range without measuring an installed graph', t => {
  const f = scopeWriterFixture(t);
  const commands = [];
  const execute = (command, args, options) => {
    commands.push([command, ...args]);
    return execFileSync(command, args, options);
  };
  const receipt = writeSourceDocsScope(f.environment, execute);
  assert.equal(receipt.baseSha, f.baseSha);
  assert.equal(receipt.headSha, f.headSha);
  assert.deepEqual(receipt.paths, [docsPath]);
  assert.equal(receipt.pathsDigest, hashPaths([docsPath]));
  assert.ok(commands.every(command => command[0] === 'git'));
  assert.ok(commands.some(command => command.includes('--no-renames')));
  assert.ok(!Object.hasOwn(receipt, 'resolved'));
  assert.ok(!existsSync(join(f.receipts, 'dep-digest.json')));
  assert.equal(
    JSON.parse(readFileSync(join(f.receipts, 'source-docs-scope.json'), 'utf8'))
      .prNumber,
    123
  );
  assert.throws(() => writeSourceDocsScope(f.environment), /EEXIST/);
  const cliDir = join(f.receipts, 'native-cli');
  execFileSync(
    process.execPath,
    [
      join(import.meta.dirname, 'dependency-parity-evidence.mjs'),
      'write-scope',
    ],
    {
      cwd: f.root,
      env: {
        ...f.environment,
        DEPENDENCY_PARITY_RECEIPT_DIR: cliDir,
        GIT_DIR: join(f.root, 'foreign-routing'),
        GIT_WORK_TREE: join(f.root, 'foreign-worktree'),
        GIT_INDEX_FILE: join(f.root, 'foreign-index'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  assert.equal(
    JSON.parse(readFileSync(join(cliDir, 'source-docs-scope.json'), 'utf8'))
      .headSha,
    f.headSha
  );
});

test('scope writer rejects foreign events, stale checkout and a nonancestor base', t => {
  const f = scopeWriterFixture(t);
  for (const overrides of [
    { GITHUB_REPOSITORY: 'foreign/repo' },
    { GITHUB_EVENT_NAME: 'merge_group' },
    { GITHUB_RUN_ATTEMPT: '0' },
  ])
    assert.throws(() =>
      writeSourceDocsScope({ ...f.environment, ...overrides })
    );
  f.event.pull_request.head.repo.fork = true;
  f.writeEvent();
  assert.throws(() => writeSourceDocsScope(f.environment), /pull request/);
  f.event.pull_request.head.repo.fork = false;
  f.event.repository.full_name = 'foreign/repo';
  f.writeEvent();
  assert.throws(() => writeSourceDocsScope(f.environment), /pull request/);
  f.event.repository.full_name = 'JovieInc/Jovie';
  f.event.pull_request.head.sha = base;
  f.writeEvent();
  assert.throws(() => writeSourceDocsScope(f.environment), /source mismatch/);
  f.event.pull_request.head.sha = f.headSha;
  f.git('checkout', '-q', '--detach', f.baseSha);
  writeFileSync(
    join(f.root, 'docs/research/other-notes.md'),
    'Sibling base.\n'
  );
  f.git('add', 'docs/research/other-notes.md');
  f.git('commit', '-qm', 'newer main base');
  f.event.pull_request.base.sha = f.git('rev-parse', 'HEAD');
  f.git('checkout', '-q', '--detach', f.headSha);
  f.writeEvent();
  assert.throws(() => writeSourceDocsScope(f.environment), /not an ancestor/);
  assert.ok(!existsSync(join(f.receipts, 'source-docs-scope.json')));
});

test('scope writer refuses dirty and compare-truncated generations', t => {
  const f = scopeWriterFixture(t);
  assert.throws(
    () =>
      writeSourceDocsScope(f.environment, (command, args, options) =>
        args[0] === 'rev-list' ? '251\n' : execFileSync(command, args, options)
      ),
    /complete compare bound/
  );
  writeFileSync(join(f.root, docsPath), 'Uncommitted source.\n');
  assert.throws(
    () => writeSourceDocsScope(f.environment),
    /checkout is modified/
  );
  f.git('add', docsPath);
  assert.throws(
    () => writeSourceDocsScope(f.environment),
    /checkout is modified/
  );
  assert.ok(!existsSync(join(f.receipts, 'source-docs-scope.json')));
});

test('native source docs writer rejects deletions and retains rename originals for full validation', t => {
  const f = scopeWriterFixture(t);
  f.git('mv', docsPath, 'docs/research/renamed-notes.md');
  f.git('commit', '-qm', 'renamed prose');
  f.event.pull_request.head.sha = f.git('rev-parse', 'HEAD');
  f.writeEvent();
  assert.throws(
    () => writeSourceDocsScope(f.environment),
    /deletion or rename/
  );
  f.git('checkout', '-q', '--detach', f.headSha);
  f.git('rm', docsPath);
  f.git('commit', '-qm', 'removed prose');
  f.event.pull_request.head.sha = f.git('rev-parse', 'HEAD');
  f.writeEvent();
  assert.throws(
    () => writeSourceDocsScope(f.environment),
    /deletion or rename/
  );
});

test('scope artifact uses its distinct single archive member and rejects digest masquerading', t => {
  const root = mkdtempSync(join(tmpdir(), 'source-scope-archive-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'source-docs-scope.json'), JSON.stringify(scope()));
  const zip = join(root, 'scope.zip');
  execFileSync('zip', ['-q', zip, 'source-docs-scope.json'], { cwd: root });
  const download = () => readFileSync(zip);
  assert.equal(
    readDigestArtifact(
      { id: 9, name: `source-docs-scope-8-1-${sourceHead}` },
      download
    ).pathsDigest,
    hashPaths([docsPath])
  );
  assert.throws(
    () =>
      readDigestArtifact(
        { id: 9, name: `dependency-digest-8-1-${sourceHead}` },
        download
      ),
    /Unexpected dependency archive/
  );
  writeFileSync(join(root, 'dep-digest.json'), JSON.stringify(digest()));
  execFileSync('zip', ['-q', zip, 'dep-digest.json'], { cwd: root });
  assert.throws(
    () =>
      readDigestArtifact(
        { id: 9, name: `source-docs-scope-8-1-${sourceHead}` },
        download
      ),
    /Unexpected dependency archive/
  );
});
