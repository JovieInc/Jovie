import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const script = resolve('scripts/security/prepare-evidence-history.sh');
const git = (cwd, ...args) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

test('fetches complete selected histories only and fails closed on incomplete inputs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-history-'));
  try {
    const source = join(dir, 'source');
    git(dir, 'init', '-q', '-b', 'main', source);
    git(source, 'config', 'user.name', 'Fixture');
    git(source, 'config', 'user.email', 'fixture@example.invalid');
    writeFileSync(join(source, 'root'), 'root');
    git(source, 'add', '.');
    git(source, 'commit', '-qm', 'root');
    git(source, 'switch', '-qc', 'feature');
    writeFileSync(join(source, 'history'), 'historical content');
    git(source, 'add', '.');
    git(source, 'commit', '-qm', 'history');
    git(source, 'rm', '-q', 'history');
    git(source, 'commit', '-qm', 'remove');
    git(source, 'switch', '-qc', 'side', 'HEAD~1');
    writeFileSync(join(source, 'side'), 'side content');
    git(source, 'add', '.');
    git(source, 'commit', '-qm', 'side');
    git(source, 'switch', '-q', 'feature');
    git(source, 'merge', '-q', '--no-ff', 'side', '-m', 'merge side');
    const head = git(source, 'rev-parse', 'HEAD');
    git(source, 'switch', '-q', 'main');
    writeFileSync(join(source, 'base'), 'base');
    git(source, 'add', '.');
    git(source, 'commit', '-qm', 'base');
    git(source, 'switch', '-qc', 'unrelated');
    writeFileSync(join(source, 'unrelated'), 'unrelated');
    git(source, 'add', '.');
    git(source, 'commit', '-qm', 'unrelated');
    git(source, 'tag', 'unrelated-tag');
    const clone = join(dir, 'clone');
    git(
      dir,
      'clone',
      '-q',
      '--depth=1',
      '--no-tags',
      '--branch',
      'feature',
      `file://${source}`,
      clone
    );
    const run = (sha = head) =>
      spawnSync('bash', [script, sha, 'main'], {
        cwd: clone,
        encoding: 'utf8',
      });
    assert.equal(run('f'.repeat(40)).status, 1, 'wrong head fails');
    assert.notEqual(
      spawnSync('bash', [script, head, 'missing-base'], { cwd: clone }).status,
      0,
      'missing base fails'
    );
    const alternates = join(clone, '.git', 'objects', 'info', 'alternates');
    writeFileSync(alternates, '/tmp/not-an-object-store\n');
    assert.notEqual(run().status, 0, 'alternates fail');
    rmSync(alternates);
    assert.notEqual(
      spawnSync('bash', [script, head, 'main'], {
        cwd: clone,
        env: {
          ...process.env,
          GIT_ALTERNATE_OBJECT_DIRECTORIES: '/tmp/unused',
        },
      }).status,
      0,
      'environment alternates fail'
    );
    git(clone, 'config', 'remote.origin.partialclonefilter', 'blob:none');
    assert.notEqual(run().status, 0, 'partial clone filter fails');
    git(clone, 'config', '--unset', 'remote.origin.partialclonefilter');
    const shimDir = join(dir, 'shim');
    mkdirSync(shimDir);
    const shim = join(shimDir, 'git');
    writeFileSync(
      shim,
      '#!/bin/sh\nif [ "$1" = fetch ]; then exit 1; fi\nexec /usr/bin/git "$@"\n'
    );
    chmodSync(shim, 0o755);
    assert.notEqual(
      spawnSync('bash', [script, head, 'main'], {
        cwd: clone,
        env: { ...process.env, PATH: `${shimDir}:${process.env.PATH}` },
      }).status,
      0,
      'fetch failure fails'
    );
    writeFileSync(
      shim,
      '#!/bin/sh\nif [ "$1" = fetch ]; then exit 0; fi\nexec /usr/bin/git "$@"\n'
    );
    chmodSync(shim, 0o755);
    const shallow = spawnSync('bash', [script, head, 'main'], {
      cwd: clone,
      env: { ...process.env, PATH: `${shimDir}:${process.env.PATH}` },
      encoding: 'utf8',
    });
    assert.notEqual(shallow.status, 0, 'shallow repository fails');
    assert.match(shallow.stderr, /remains shallow/);
    const blob = git(source, 'rev-parse', `${head}~2:history`);
    writeFileSync(
      shim,
      `#!/bin/sh\n/usr/bin/git "$@" || exit $?\nif [ "$1" = fetch ]; then rm -f .git/objects/${blob.slice(0, 2)}/${blob.slice(2)}; fi\n`
    );
    chmodSync(shim, 0o755);
    const missing = spawnSync('bash', [script, head, 'main'], {
      cwd: clone,
      env: { ...process.env, PATH: `${shimDir}:${process.env.PATH}` },
      encoding: 'utf8',
    });
    assert.notEqual(missing.status, 0, 'missing historical blob fails');
    assert.match(
      missing.stderr,
      /missing objects|unreadable objects|cannot traverse/
    );
    rmSync(shim);
    // Recreate the shallow checkout after the deliberate missing-object test.
    rmSync(clone, { recursive: true, force: true });
    git(
      dir,
      'clone',
      '-q',
      '--depth=1',
      '--no-tags',
      '--branch',
      'feature',
      `file://${source}`,
      clone
    );
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(git(clone, 'rev-parse', '--is-shallow-repository'), 'false');
    assert.equal(
      git(clone, 'rev-parse', 'origin/main'),
      git(source, 'rev-parse', 'main')
    );
    assert.equal(git(clone, 'rev-list', '--all', '--count'), '6');
    assert.equal(git(clone, 'tag', '-l'), '');
    assert.equal(git(clone, 'show', `${head}~2:history`), 'historical content');
    assert.equal(readFileSync(join(clone, 'root'), 'utf8'), 'root');
    git(clone, 'config', 'remote.origin.promisor', 'true');
    assert.equal(run().status, 1, 'promisor checkout fails');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
