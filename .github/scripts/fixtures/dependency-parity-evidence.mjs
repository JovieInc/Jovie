import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  SCRIPT_CONTRACT_NODE_TESTS,
  SCRIPT_CONTRACT_VITEST_TESTS,
} from '../../../scripts/ci-fast-lanes.mjs';

export const sha = 'a'.repeat(40),
  base = 'b'.repeat(40),
  sourceHead = 'c'.repeat(40);
const resolved = { 'js-yaml': ['4.1.0'] };
export const docsPath = 'docs/research/source-validation-fastpath-notes.md';
export function proseEntries({ paths }) {
  return paths.map(path => {
    const bytes = Buffer.from('Measured research.\n');
    return {
      path,
      mode: '100644',
      type: 'blob',
      sha: createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex'),
      bytes,
    };
  });
}
export const hashPaths = paths =>
  createHash('sha256').update(JSON.stringify(paths)).digest('hex');
export function fixtureGitEnvironment() {
  const environment = { ...process.env };
  for (const name of execFileSync('git', ['rev-parse', '--local-env-vars'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n'))
    if (name) delete environment[name];
  return environment;
}
export function classifierFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'source-scope-policy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const trustedRoot = join(import.meta.dirname, '../../..');
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
export function scope(overrides = {}) {
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
export function digest(overrides = {}) {
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
export function scopeFixture(root) {
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
    commits: [{ sha: sourceHead, commit: { tree: { sha: 'e'.repeat(40) } } }],
    files: [
      {
        filename: docsPath,
        status: 'modified',
        sha: proseEntries({ paths: [docsPath] })[0].sha,
      },
    ],
  };
  const entry = proseEntries({ paths: [docsPath] })[0];
  f.proseTree = {
    sha: 'e'.repeat(40),
    truncated: false,
    tree: [{ ...entry, bytes: undefined, size: entry.bytes.length }],
  };
  f.proseBlob = {
    sha: entry.sha,
    encoding: 'base64',
    size: entry.bytes.length,
    content: entry.bytes.toString('base64'),
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
    if (path === `repos/JovieInc/Jovie/git/trees/${'e'.repeat(40)}?recursive=1`)
      return f.proseTree;
    if (path === `repos/JovieInc/Jovie/git/blobs/${f.proseBlob.sha}`)
      return f.proseBlob;
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
export function fixture() {
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
