import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { compare, LIMIT, lineCount, run } from '../company-guards/size.mjs';

test('company size ratchet counts like Company Guards and rejects growth', () => {
  assert.equal(lineCount('a\nb\n'), 2);
  assert.equal(lineCount('a\nb'), 2);
  assert.equal(LIMIT, 500);
  const file = 'scripts/lib/credentials-registry.mjs';
  assert.deepEqual(compare({ [file]: 688 }, { [file]: 687 }), [
    `${file}: grew 687 -> 688`,
  ]);
  assert.deepEqual(compare({ [file]: 687 }, { [file]: 687 }), []);
  assert.deepEqual(compare({ 'new/file.mjs': 501 }, {}), [
    'new/file.mjs: 501 lines, over 500 and not baselined',
  ]);
});

test('company size ratchet refuses to rewrite its baseline', () => {
  const result = spawnSync(
    process.execPath,
    [
      new URL('../company-guards/size.mjs', import.meta.url).pathname,
      '--update',
    ],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /--update is refused/);
});

test('company size guard rejects growth introduced only by merging main', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'size-merged-'));
  const git = args =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  const write = lines =>
    writeFileSync(join(cwd, 'source.mjs'), lines.join('\n') + '\n');
  const commit = message => {
    git(['add', '.']);
    git(['commit', '-qm', message]);
  };
  try {
    git(['init', '-q', '--initial-branch=main']);
    git(['config', 'user.name', 'Size Fixture']);
    git(['config', 'user.email', 'size@example.invalid']);
    const base = Array.from({ length: 499 }, (_, i) => `// line ${i}`);
    write(base);
    commit('base');
    git(['switch', '-qc', 'repair']);
    write(['// repair addition', ...base]);
    commit('repair');
    git(['switch', '-q', 'main']);
    write([...base, '// main addition']);
    commit('main');
    git(['switch', '-q', 'repair']);

    assert.deepEqual(run({ cwd }).fails, []);
    assert.deepEqual(run({ cwd, baseRef: 'main' }).fails, [
      'merged tree: source.mjs: 501 lines, over 500 and not baselined',
    ]);
    // Removing the branch's addition leaves a valid 500-line merge.
    write(base);
    commit('repair within budget');
    assert.deepEqual(run({ cwd, baseRef: 'main' }).fails, []);
    assert.throws(() => run({ cwd, baseRef: 'missing-main' }));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('a cold guard cache cannot modify the committing repository index or Git state', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'size-warm-index-'));
  const parent = join(scratch, 'parent');
  const remote = join(scratch, 'ci');
  const git = (cwd, ...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  const init = cwd => {
    mkdirSync(cwd);
    git(cwd, 'init', '-q');
    git(cwd, 'config', 'user.name', 'Fixture');
    git(cwd, 'config', 'user.email', 'fixture@example.invalid');
  };
  try {
    init(remote);
    mkdirSync(join(remote, 'guards'));
    mkdirSync(join(remote, 'canon'));
    writeFileSync(
      join(remote, 'guards/size.mjs'),
      'export const LIMIT = 500;\n'
    );
    writeFileSync(join(remote, 'canon/COMPANY.md'), 'CI fixture canon\n');
    git(remote, 'add', '.');
    git(remote, '-c', 'commit.gpgSign=false', 'commit', '-qm', 'fixture');
    const pin = git(remote, 'rev-parse', 'HEAD');
    init(parent);
    mkdirSync(join(parent, '.github/workflows'), { recursive: true });
    writeFileSync(
      join(parent, '.github/workflows/company-guards.yml'),
      `# ci-ref: ${pin}\n`
    );
    writeFileSync(join(parent, 'source.txt'), 'original\n');
    git(parent, 'add', '.');
    git(parent, '-c', 'commit.gpgSign=false', 'commit', '-qm', 'parent');
    writeFileSync(join(parent, 'source.txt'), 'staged work\n');
    git(parent, 'add', 'source.txt');
    const index = resolve(
      parent,
      git(parent, 'rev-parse', '--git-path', 'index')
    );
    const before = readFileSync(index);
    const head = git(parent, 'rev-parse', 'HEAD');
    const script = new URL('./company-size-local.sh', import.meta.url).pathname;
    for (const [label, extra] of [
      ['index', { GIT_INDEX_FILE: index }],
      [
        'repository',
        {
          GIT_INDEX_FILE: index,
          GIT_DIR: join(parent, '.git'),
          GIT_WORK_TREE: parent,
          GIT_COMMON_DIR: join(parent, '.git'),
        },
      ],
    ]) {
      const cache = join(scratch, label);
      const run = spawnSync('bash', [script, '--warm'], {
        cwd: parent,
        encoding: 'utf8',
        timeout: 15000,
        env: {
          ...process.env,
          ...extra,
          XDG_CACHE_HOME: cache,
          JOVIE_CI_REMOTE: remote,
        },
      });
      assert.equal(run.status, 0, run.stderr);
      assert.ok(existsSync(join(cache, 'jovie-ci', pin, 'guards/size.mjs')));
      assert.deepEqual(
        readFileSync(index),
        before,
        `${label}: parent index must remain byte-identical`
      );
      assert.equal(git(parent, 'rev-parse', 'HEAD'), head);
      assert.equal(
        readFileSync(join(parent, 'source.txt'), 'utf8'),
        'staged work\n'
      );
      assert.equal(existsSync(join(parent, 'guards')), false);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
