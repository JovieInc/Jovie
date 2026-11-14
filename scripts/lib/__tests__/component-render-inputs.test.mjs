import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, describe, it } from 'vitest';
import {
  renderBindingProblem,
  renderReceiptCurrent,
  STORYBOOK_PROFILE,
  snapshotRenderInputs,
  storybookProfile,
} from '../component-render-inputs.mjs';

const owned = new Set();
const gitEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
);

afterEach(() => {
  for (const path of owned) rmSync(path, { recursive: true, force: true });
  owned.clear();
});

/** @param {Record<string, string>} [files] */
function fixture(
  files = {
    'package.json': '{}',
    'apps/web/app/globals.css': 'body { color: red }',
  }
) {
  const root = mkdtempSync(join(tmpdir(), 'render-input-contract-'));
  owned.add(root);
  const put = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  execFileSync('git', ['init', '--quiet'], { cwd: root, env: gitEnv });
  for (const [path, text] of Object.entries(files)) put(path, text);
  execFileSync('git', ['add', '.'], { cwd: root, env: gitEnv });
  return {
    root,
    put,
    snapshot: profile => snapshotRenderInputs(root, profile),
  };
}

function binding(f) {
  const result = f.snapshot();
  assert.equal(result.problem, null);
  assert.equal(renderBindingProblem(result.binding), null);
  return result.binding;
}

describe('render input provenance', () => {
  it('reuses unchanged bytes and is independent of file creation order', () => {
    const a = fixture({
      'package.json': '{}',
      'apps/web/styles/base.css': 'a{}',
    });
    const b = fixture({
      'apps/web/styles/base.css': 'a{}',
      'package.json': '{}',
    });
    assert.deepEqual(binding(a), binding(a));
    assert.deepEqual(binding(a), binding(b));
    assert.equal(a.snapshot().files, 2);
    assert.equal(a.snapshot().bytes, Buffer.byteLength('{}a{}'));
  });

  for (const [name, path] of [
    ['shared CSS', 'apps/web/app/globals.css'],
    ['an existing story', 'packages/ui/atoms/button.stories.tsx'],
    ['an imported primitive', 'packages/ui/atoms/button.tsx'],
    ['a shared frontend library', 'apps/web/lib/shared.ts'],
  ]) {
    it(`invalidates cached observations after ${name} changes without staging`, () => {
      const f = fixture({ 'package.json': '{}', [path]: 'before' });
      const before = binding(f);
      f.put(path, 'after!');
      assert.notEqual(binding(f).digest, before.digest);
    });
  }

  it('includes a new untracked story and notices its later removal', () => {
    const f = fixture();
    const before = binding(f);
    f.put('packages/ui/atoms/new.stories.tsx', 'export const Default = {}');
    assert.notEqual(binding(f).digest, before.digest);
    rmSync(join(f.root, 'packages/ui/atoms/new.stories.tsx'));
    assert.deepEqual(binding(f), before);
  });

  it('keeps ordinary API, test, and documentation edits out of the render key', () => {
    const f = fixture();
    const before = binding(f);
    f.put('apps/web/app/api/status/route.ts', 'export const GET = () => null');
    f.put('apps/web/tests/unit/status.test.ts', 'test("status", () => {})');
    f.put('packages/ui/docs/status.md', '# Documentation');
    assert.deepEqual(binding(f), before);
  });

  it('fails closed when a tracked input disappears', () => {
    const f = fixture();
    rmSync(join(f.root, 'apps/web/app/globals.css'));
    const result = f.snapshot();
    assert.equal(result.binding, null);
    assert.ok(result.problem);
  });

  it('fails closed without Git inventory or any selected inputs', () => {
    const f = fixture({});
    assert.equal(f.snapshot().binding, null);
    rmSync(join(f.root, '.git'), { recursive: true });
    assert.equal(f.snapshot().binding, null);
  });

  it('binds confined symlink target bytes even outside the selected directories', () => {
    const f = fixture();
    const target = join(f.root, 'asset-catalog/avatar.txt');
    f.put('asset-catalog/avatar.txt', 'original avatar');
    const link = join(f.root, 'apps/web/public/avatar.txt');
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(relative(dirname(link), target), link);
    const before = binding(f);
    f.put('asset-catalog/avatar.txt', 'changed avatar');
    assert.notEqual(binding(f).digest, before.digest);
  });

  it('invalidates a retargeted asset link even when both targets contain identical bytes', () => {
    const f = fixture();
    f.put('asset-catalog/a.txt', 'same bytes');
    f.put('asset-catalog/b.txt', 'same bytes');
    const link = join(f.root, 'apps/web/public/avatar.txt');
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(
      relative(dirname(link), join(f.root, 'asset-catalog/a.txt')),
      link
    );
    const before = binding(f);
    rmSync(link);
    symlinkSync(
      relative(dirname(link), join(f.root, 'asset-catalog/b.txt')),
      link
    );
    assert.notEqual(binding(f).digest, before.digest);
  });

  for (const kind of ['broken', 'outside', 'directory', 'cycle']) {
    it(`rejects a ${kind} asset symlink instead of certifying unavailable inputs`, () => {
      const f = fixture();
      const link = join(f.root, 'apps/web/public/avatar.txt');
      mkdirSync(dirname(link), { recursive: true });
      const outside = mkdtempSync(join(tmpdir(), 'render-input-outside-'));
      owned.add(outside);
      writeFileSync(join(outside, 'avatar.txt'), 'external');
      const target =
        kind === 'outside'
          ? join(outside, 'avatar.txt')
          : kind === 'directory'
            ? f.root
            : kind === 'cycle'
              ? link
              : join(f.root, 'missing.txt');
      symlinkSync(relative(dirname(link), target), link);
      const result = f.snapshot();
      assert.equal(result.binding, null);
      assert.ok(result.problem);
    });
  }

  it('separates full production-style Storybook settings from the live pilot', () => {
    const f = fixture();
    assert.deepEqual(
      storybookProfile({ CI: 'true', JOVIE_STORYBOOK_MANUAL_AXE: '1' }),
      STORYBOOK_PROFILE
    );
    const full = binding(f);
    const pilot = f.snapshot({
      ...STORYBOOK_PROFILE,
      JOVIE_LIVE_STORYBOOK_CERT: '1',
    });
    assert.notEqual(pilot.binding.digest, full.digest);
    assert.notEqual(
      f.snapshot(storybookProfile({})).binding.digest,
      full.digest
    );
  });

  for (const status of ['pass', 'fail']) {
    it(`requires current source and render inputs for a historical ${status} receipt`, () => {
      const f = fixture();
      const current = binding(f);
      const sourceHash = 'a'.repeat(64);
      const receipt = { status, sourceHash, renderInputs: current };
      assert.equal(renderReceiptCurrent(receipt, sourceHash, current), true);
      assert.equal(
        renderReceiptCurrent(receipt, 'b'.repeat(64), current),
        false
      );
      assert.equal(
        renderReceiptCurrent({ status, sourceHash }, sourceHash, current),
        false
      );
      assert.equal(renderReceiptCurrent(receipt, sourceHash, null), false);
      assert.equal(
        renderReceiptCurrent(
          { ...receipt, renderInputs: { ...current, mode: 'storybook-live' } },
          sourceHash,
          current
        ),
        false
      );
      f.put('apps/web/app/globals.css', 'body { color: blue }');
      assert.equal(
        renderReceiptCurrent(receipt, sourceHash, binding(f)),
        false
      );
    });
  }
});
