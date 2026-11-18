import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  collectDependencyParity,
  compareDependencyDigests,
  readDigestArtifact,
  validateDependencyDigest,
  writeDependencyDigest,
} from './dependency-parity-evidence.mjs';
import {
  base,
  digest,
  fixture,
  fixtureGitEnvironment,
  sha,
  sourceHead,
} from './fixtures/dependency-parity-evidence.mjs';
import './dependency-parity-source-docs-collector.test.mjs';
import './dependency-parity-source-docs-writer.test.mjs';

test('exact successful source run and attempt-bound artifact compare against actual group graph', () => {
  const f = fixture();
  const report = collectDependencyParity(f.input);
  assert.deepEqual(report.comparisons, [
    { prNumber: 123, sourceHeadSha: sourceHead, comparable: true },
  ]);
  assert.equal(f.calls.filter(path => path.endsWith('/pulls/123')).length, 2);
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
