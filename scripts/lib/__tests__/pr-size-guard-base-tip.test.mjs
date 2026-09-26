import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const WORKFLOW = readFileSync(
  resolve(import.meta.dirname, '../../../.github/workflows/pr-size-guard.yml'),
  'utf8'
);

/** @param {string} name */
function step(name) {
  const block = WORKFLOW.split(/\n(?=      - name: )/u).find(candidate =>
    candidate.startsWith(`      - name: ${name}\n`)
  );
  if (!block) throw new Error(`step "${name}" is missing`);
  return block;
}

/** @param {string} name */
function stepRunScript(name) {
  const body = step(name).match(/\n {8}run: \|\n((?: {10}.*\n?)+)/u)?.[1];
  if (!body) throw new Error(`step "${name}" has no run block`);
  return body.replace(/^ {10}/gmu, '');
}

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** @param {string} cwd @param {string} message */
function commit(cwd, message) {
  writeFileSync(join(cwd, `${message}.txt`), `${message}\n`);
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '-q', '-m', message]);
  return git(cwd, ['rev-parse', 'HEAD']);
}

const dirs = /** @type {string[]} */ ([]);
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('PR Size Guard base resolution', () => {
  it('never judges a PR against the event base SHA', () => {
    // pull_request.base.sha is not refreshed on synchronize: #18131's run
    // archived a three-day-old base without projected-tree-budget.mjs and
    // failed with MODULE_NOT_FOUND.
    expect(step('Resolve exact PR merge base')).not.toContain(
      'github.event.pull_request.base.sha'
    );
    expect(step('Enforce projected combined-tree byte budget')).toContain(
      'PR_BASE_SHA: ${{ steps.pr-merge-base.outputs.base_tip }}'
    );
  });

  it('resolves the fetched base branch tip, not the stale event base', () => {
    const root = mkdtempSync(join(tmpdir(), 'pr-size-guard-base-'));
    dirs.push(root);
    const origin = join(root, 'origin');
    const clone = join(root, 'clone');
    execFileSync('git', ['init', '-q', '-b', 'main', origin]);
    git(origin, ['config', 'user.email', 'ci@example.com']);
    git(origin, ['config', 'user.name', 'ci']);
    commit(origin, 'root');
    git(origin, ['checkout', '-q', '-b', 'feature']);
    commit(origin, 'feature-work');
    git(origin, ['checkout', '-q', 'main']);
    commit(origin, 'main-moves-on');
    const mainTip = commit(origin, 'policy-lands');
    git(origin, ['checkout', '-q', 'feature']);
    git(origin, ['merge', '-q', '--no-edit', 'main']);
    const head = git(origin, ['rev-parse', 'HEAD']);
    execFileSync('git', ['clone', '-q', `file://${origin}`, clone]);
    git(clone, ['checkout', '-q', head]);
    const output = join(root, 'github-output');
    writeFileSync(output, '');

    execFileSync('bash', ['-c', stepRunScript('Resolve exact PR merge base')], {
      cwd: clone,
      env: {
        ...process.env,
        GITHUB_OUTPUT: output,
        PR_BASE_REF: 'main',
        PR_HEAD_SHA: head,
      },
      stdio: 'pipe',
    });

    const outputs = Object.fromEntries(
      readFileSync(output, 'utf8')
        .trim()
        .split('\n')
        .map(line => line.split('='))
    );
    expect(outputs.base_tip).toBe(mainTip);
    // The PR merged main, so its only merge base is the current tip and the
    // hygiene/budget delta covers only the PR's own changes.
    expect(outputs.sha).toBe(mainTip);
  });
});
