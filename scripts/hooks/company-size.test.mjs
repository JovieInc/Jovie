import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
