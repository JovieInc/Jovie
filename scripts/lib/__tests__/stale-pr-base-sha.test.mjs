import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// github.event.pull_request.base.sha is not refreshed when a PR head is
// pushed (#18131 saw a three-day-old base right after merging main). Every
// step that diffs a PR against its base must resolve the base itself.

const WORKFLOWS = resolve(import.meta.dirname, '../../../.github/workflows');

/** @param {string} file */
function workflow(file) {
  return readFileSync(join(WORKFLOWS, file), 'utf8');
}

/** @param {string} file @param {string} name */
function step(file, name) {
  const block = workflow(file)
    .split(/\n(?=      - name: )/u)
    .find(candidate => candidate.startsWith(`      - name: ${name}\n`));
  if (!block) throw new Error(`${file}: step "${name}" is missing`);
  return block;
}

/** @param {string} file @param {string} name */
function stepRunScript(file, name) {
  const body = step(file, name).match(/\n {8}run: \|\n((?: {10}.*\n?)+)/u)?.[1];
  if (!body) throw new Error(`${file}: step "${name}" has no run block`);
  return body.replace(/^ {10}/gmu, '');
}

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** @param {string} cwd @param {string} name */
function commit(cwd, name) {
  writeFileSync(join(cwd, `${name}.txt`), `${name}\n`);
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '-q', '-m', name]);
  return git(cwd, ['rev-parse', 'HEAD']);
}

const dirs = /** @type {string[]} */ ([]);
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * origin/main: root -> main-moves-on
 * feature:     root -> feature-work -> merge(main)
 * The event base SHA stays at `root` (stale) after the PR merges main.
 */
function staleBaseRepo({ mergeMain = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'stale-pr-base-'));
  dirs.push(root);
  const origin = join(root, 'origin');
  const clone = join(root, 'clone');
  execFileSync('git', ['init', '-q', '-b', 'main', origin]);
  git(origin, ['config', 'user.email', 'ci@example.com']);
  git(origin, ['config', 'user.name', 'ci']);
  const staleBase = commit(origin, 'root');
  git(origin, ['checkout', '-q', '-b', 'feature']);
  const forkWork = commit(origin, 'feature-work');
  git(origin, ['checkout', '-q', 'main']);
  const mainTip = commit(origin, 'main-moves-on');
  git(origin, ['checkout', '-q', 'feature']);
  if (mergeMain) git(origin, ['merge', '-q', '--no-edit', 'main']);
  const head = git(origin, ['rev-parse', 'HEAD']);
  execFileSync('git', ['clone', '-q', `file://${origin}`, clone]);
  git(clone, ['checkout', '-q', head]);
  const output = join(root, 'github-output');
  writeFileSync(output, '');
  return { clone, output, staleBase, forkWork, mainTip, head };
}

/** @param {string} script @param {string} cwd @param {Record<string, string>} env */
function runStep(script, cwd, env) {
  return spawnSync('bash', ['-c', script], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

/** @param {string} output */
function outputs(output) {
  return Object.fromEntries(
    readFileSync(output, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => line.split('='))
  );
}

/** @param {string} cwd @param {string} base @param {string} head */
function changedFiles(cwd, base, head) {
  return git(cwd, ['diff', '--name-only', `${base}...${head}`])
    .split('\n')
    .filter(Boolean);
}

describe('exact-head coverage diff base (ci.yml)', () => {
  const COVERAGE_STEP = 'Verify exact coverage head and diff base';

  it('never diffs coverage against the event base SHA', () => {
    const coverage = workflow('ci.yml').slice(
      workflow('ci.yml').indexOf('  ci-exact-head-coverage:'),
      workflow('ci.yml').indexOf('  ci-a11y:')
    );
    expect(coverage).not.toContain('github.event.pull_request.base.sha');
    expect(step('ci.yml', COVERAGE_STEP)).toContain('id: coverage-base');
    expect(
      step('ci.yml', 'Run exact-head coverage and changed-behavior ratchet')
    ).toContain('COVERAGE_BASE: ${{ steps.coverage-base.outputs.sha }}');
  });

  it('charges only the PR changes after the PR merged main', () => {
    const repo = staleBaseRepo();
    // The bug: the stale event base charges main's commit to the PR.
    expect(changedFiles(repo.clone, repo.staleBase, repo.head)).toContain(
      'main-moves-on.txt'
    );

    const result = runStep(stepRunScript('ci.yml', COVERAGE_STEP), repo.clone, {
      EVENT_NAME: 'pull_request',
      EXPECTED_HEAD: repo.head,
      MERGE_GROUP_BASE: '',
      PR_BASE_REF: 'main',
      GITHUB_OUTPUT: repo.output,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(outputs(repo.output).sha).toBe(repo.mainTip);
    expect(changedFiles(repo.clone, repo.mainTip, repo.head)).toEqual([
      'feature-work.txt',
    ]);
  });

  it('uses the fork point, not the tip, when main advanced past the PR', () => {
    const repo = staleBaseRepo({ mergeMain: false });
    const result = runStep(stepRunScript('ci.yml', COVERAGE_STEP), repo.clone, {
      EVENT_NAME: 'pull_request',
      EXPECTED_HEAD: repo.head,
      MERGE_GROUP_BASE: '',
      PR_BASE_REF: 'main',
      GITHUB_OUTPUT: repo.output,
    });
    expect(result.status, result.stderr).toBe(0);
    // A tip base would make `vitest --changed` see main's newer file.
    expect(outputs(repo.output).sha).toBe(repo.staleBase);
  });

  it('keeps the exact merge-group base and fails closed on bad input', () => {
    const repo = staleBaseRepo();
    const script = stepRunScript('ci.yml', COVERAGE_STEP);
    const ok = runStep(script, repo.clone, {
      EVENT_NAME: 'merge_group',
      EXPECTED_HEAD: repo.head,
      MERGE_GROUP_BASE: repo.forkWork,
      PR_BASE_REF: '',
      GITHUB_OUTPUT: repo.output,
    });
    expect(ok.status, ok.stderr).toBe(0);
    expect(outputs(repo.output).sha).toBe(repo.forkWork);

    for (const bad of [
      { EVENT_NAME: 'pull_request', PR_BASE_REF: 'main;true' },
      { EVENT_NAME: 'pull_request', PR_BASE_REF: 'no-such-base' },
      {
        EVENT_NAME: 'pull_request',
        PR_BASE_REF: 'main',
        EXPECTED_HEAD: repo.staleBase,
      },
      { EVENT_NAME: 'merge_group', MERGE_GROUP_BASE: 'invalid' },
    ]) {
      writeFileSync(repo.output, '');
      const failed = runStep(script, repo.clone, {
        EXPECTED_HEAD: repo.head,
        MERGE_GROUP_BASE: '',
        PR_BASE_REF: 'main',
        GITHUB_OUTPUT: repo.output,
        ...bad,
      });
      expect(failed.status, JSON.stringify(bad)).not.toBe(0);
      expect(readFileSync(repo.output, 'utf8')).toBe('');
    }
  });
});

describe('PR visual review routing base (pr-visual-review.yml)', () => {
  const FILE = 'pr-visual-review.yml';
  const RESOLVE_STEP = 'Resolve PR base branch tip';

  it('routes from the resolved base tip, not the event base SHA', () => {
    expect(workflow(FILE)).not.toContain('github.event.pull_request.base.sha');
    expect(step(FILE, 'Route changed files')).toContain(
      'BASE_SHA: ${{ steps.base-tip.outputs.sha }}'
    );
    // Trust boundary: the base comes from the base repository's branch ref.
    expect(step(FILE, RESOLVE_STEP)).toContain(
      'PR_BASE_REF: ${{ github.event.pull_request.base.ref }}'
    );
  });

  it('routes only the PR changes after the PR merged main', () => {
    const repo = staleBaseRepo();
    const result = runStep(stepRunScript(FILE, RESOLVE_STEP), repo.clone, {
      PR_BASE_REF: 'main',
      GITHUB_OUTPUT: repo.output,
    });
    expect(result.status, result.stderr).toBe(0);
    const base = outputs(repo.output).sha;
    expect(base).toBe(repo.mainTip);
    expect(changedFiles(repo.clone, base, repo.head)).toEqual([
      'feature-work.txt',
    ]);
  });

  it('fails closed on a malformed or missing base ref', () => {
    const repo = staleBaseRepo();
    for (const ref of ['main;true', 'no-such-base']) {
      writeFileSync(repo.output, '');
      const failed = runStep(stepRunScript(FILE, RESOLVE_STEP), repo.clone, {
        PR_BASE_REF: ref,
        GITHUB_OUTPUT: repo.output,
      });
      expect(failed.status, ref).not.toBe(0);
      expect(readFileSync(repo.output, 'utf8')).toBe('');
    }
  });
});

describe('repository docs ratchet base (repository-docs-shadow.yml)', () => {
  const FILE = 'repository-docs-shadow.yml';
  const RESOLVE_STEP = 'Resolve merge-ref base parent';

  it('ratchets against the merge-ref base parent, not the event base SHA', () => {
    expect(workflow(FILE)).not.toContain('github.event.pull_request.base.sha');
    expect(step(FILE, 'Check source projection')).toContain(
      'BASE_SHA: ${{ steps.parity-base.outputs.sha }}'
    );
  });

  it('resolves the base parent GitHub merged the PR onto', () => {
    const repo = staleBaseRepo();
    // Simulate refs/pull/<n>/merge: current main tip merged with the PR head.
    git(repo.clone, ['config', 'user.email', 'ci@example.com']);
    git(repo.clone, ['config', 'user.name', 'ci']);
    git(repo.clone, ['checkout', '-q', repo.mainTip]);
    git(repo.clone, ['merge', '-q', '--no-ff', '--no-edit', repo.head]);

    const result = runStep(stepRunScript(FILE, RESOLVE_STEP), repo.clone, {
      GITHUB_OUTPUT: repo.output,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(outputs(repo.output).sha).toBe(repo.mainTip);
    expect(outputs(repo.output).sha).not.toBe(repo.staleBase);
  });

  it('fails closed when HEAD is not a two-parent merge ref', () => {
    const repo = staleBaseRepo({ mergeMain: false });
    const failed = runStep(stepRunScript(FILE, RESOLVE_STEP), repo.clone, {
      GITHUB_OUTPUT: repo.output,
    });
    expect(failed.status).not.toBe(0);
    expect(readFileSync(repo.output, 'utf8')).toBe('');
  });
});

describe('uses where a stale event base SHA is acceptable', () => {
  it('secret scan only proves the event base is an ancestor', () => {
    expect(workflow('ci.yml')).toContain(
      '# May be stale (not refreshed on synchronize); the range helper only'
    );
  });

  it('taste policy stays pinned to an exact trusted base commit', () => {
    for (const file of ['taste-classifier.yml', 'taste-label-guard.yml']) {
      const checkout = step(file, 'Checkout exact trusted base policy');
      expect(checkout).toContain(
        'ref: ${{ github.event.pull_request.base.sha }}'
      );
      expect(checkout).not.toContain('head.sha');
      expect(workflow(file)).toContain(
        'base.sha can lag the base tip (not refreshed on synchronize).'
      );
    }
  });
});
