import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertSizes,
  measureBundles,
  readBaseBaseline,
} from './bundle-size.mjs';

test('compiled main and bundled preload stay within measured gzip baselines', async () => {
  const baseline = JSON.parse(
    await readFile(new URL('./bundle-size.json', import.meta.url), 'utf8')
  );
  const measured = await measureBundles();
  const base = readBaseBaseline();
  if (base === null)
    assert.deepEqual(
      baseline,
      measured,
      'Initial baseline must be measured, without padding'
    );
  assertSizes(measured, baseline, base ?? baseline);
});

test('gzip ratchet accepts shrinking artifacts and rejects growth or raised allowances', () => {
  const baseline = { 'main.js': 200, 'preload.js': 100 };
  assert.doesNotThrow(() =>
    assertSizes({ 'main.js': 199, 'preload.js': 90 }, baseline)
  );
  assert.throws(
    () => assertSizes({ 'main.js': 201, 'preload.js': 100 }, baseline),
    /grew/
  );
  assert.throws(
    () => assertSizes(baseline, { ...baseline, 'main.js': 201 }, baseline),
    /only shrink/
  );
  assert.throws(
    () => assertSizes({ 'main.js': 200 }, baseline),
    /Expected positive/
  );
});

test('push and merge-group empty base refs resolve the same trusted main baseline', () => {
  assert.deepEqual(readBaseBaseline(''), readBaseBaseline('main'));
});

test('trusted baseline lookup from desktop cwd preserves shrink-only enforcement', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'desktop-baseline-git-'));
  const cwd = path.join(root, 'apps/desktop');
  const file = path.join(cwd, 'scripts/bundle-size.json');
  const baseline = { 'main.js': 200, 'preload.js': 100 };
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  try {
    await mkdir(path.dirname(file), { recursive: true });
    git('init', '-q');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'empty base'
    );
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    assert.equal(readBaseBaseline('main', cwd), null);
    await writeFile(file, JSON.stringify(baseline));
    git('add', '.');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-q',
      '-m',
      'measured baseline'
    );
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    const raised = { ...baseline, 'main.js': 201 };
    await writeFile(file, JSON.stringify(raised));
    const trusted = readBaseBaseline('main', cwd);
    assert.deepEqual(trusted, baseline);
    assert.throws(() => assertSizes(raised, raised, trusted), /only shrink/);
    assert.throws(() => readBaseBaseline('missing', cwd));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('deterministic build ignores ambient release metadata and restores no shared files', async () => {
  const generated = new URL(
    '../src/build-identity.generated.ts',
    import.meta.url
  );
  const readGenerated = () =>
    readFile(generated, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
  const before = await readGenerated();
  const first = await measureBundles();
  const second = await measureBundles();
  assert.deepEqual(first, second);
  assert.equal(await readGenerated(), before);
});
