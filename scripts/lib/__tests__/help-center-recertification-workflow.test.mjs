import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const WORKFLOW = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../.github/workflows/help-center-recertification.yml'
  ),
  'utf8'
);

/** @param {string} name */
function stepRunScript(name) {
  const step = WORKFLOW.split(/\n(?=      - name: )/u).find(block =>
    block.startsWith(`      - name: ${name}\n`)
  );
  const body = step?.match(/\n {8}run: \|\n((?: {10}.*\n?)+)/u)?.[1];
  if (!body) throw new Error(`step "${name}" has no run block`);
  return body.replace(/^ {10}/gmu, '');
}

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

const dirs = /** @type {string[]} */ ([]);
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe('help-center-recertification workflow', () => {
  it('fetches the pre-push base before the recertification script reads it', () => {
    const fetchAt = WORKFLOW.indexOf(
      '- name: Fetch the pre-push base revision'
    );
    const runAt = WORKFLOW.indexOf(
      'node scripts/help-center-recertification.mjs'
    );
    expect(fetchAt).toBeGreaterThan(-1);
    expect(fetchAt).toBeLessThan(runAt);
  });

  // A merge-queue batch pushed #18383 and #18384 together, so `before` sat two
  // commits behind head and `git show <before>:docs/FEATURE_REGISTRY.md` failed.
  it('makes a base deeper than the depth-2 checkout readable', () => {
    const root = mkdtempSync(join(tmpdir(), 'help-center-base-'));
    dirs.push(root);
    const origin = join(root, 'origin');
    const clone = join(root, 'clone');
    execFileSync('git', ['init', '-q', '-b', 'main', origin]);
    git(origin, ['config', 'user.email', 'ci@example.com']);
    git(origin, ['config', 'user.name', 'ci']);
    git(origin, ['config', 'uploadpack.allowReachableSHA1InWant', 'true']);
    const shas = [];
    for (const n of [1, 2, 3]) {
      writeFileSync(join(origin, 'FEATURE_REGISTRY.md'), `v${n}\n`);
      git(origin, ['add', '.']);
      git(origin, ['commit', '-q', '-m', `c${n}`]);
      shas.push(git(origin, ['rev-parse', 'HEAD']));
    }
    execFileSync('git', [
      'clone',
      '-q',
      '--depth=2',
      `file://${origin}`,
      clone,
    ]);
    const base = shas[0];
    expect(() => git(clone, ['cat-file', '-e', `${base}^{commit}`])).toThrow();

    execFileSync(
      'bash',
      ['-c', stepRunScript('Fetch the pre-push base revision')],
      {
        cwd: clone,
        env: { ...process.env, BASE_SHA: base },
        stdio: 'pipe',
      }
    );

    expect(git(clone, ['show', `${base}:FEATURE_REGISTRY.md`])).toBe('v1');
    expect(git(clone, ['diff', '--name-only', base, shas[2]])).toBe(
      'FEATURE_REGISTRY.md'
    );
  });
});
