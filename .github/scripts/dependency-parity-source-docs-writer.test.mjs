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
  readDigestArtifact,
  validateSourceDocsScope,
  writeSourceDocsScope,
} from './dependency-parity-evidence.mjs';
import {
  base,
  classifierFixture,
  digest,
  docsPath,
  fixtureGitEnvironment,
  hashPaths,
  scope,
  sourceHead,
} from './fixtures/dependency-parity-evidence.mjs';

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
