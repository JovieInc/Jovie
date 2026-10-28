import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';

// Main keeps advancing while a ~45 minute controller run is in flight. A
// candidate that passed every gate and is still an ancestor of main must
// promote; anything that is not forward-only must not.
const repoRoot = resolve(import.meta.dirname, '../../..');
const gate = join(repoRoot, '.github/scripts/recheck-main-lineage.sh');
const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
const roots = [];

const gitEnv = {
  PATH: process.env.PATH,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
};

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

/**
 * Builds main = c1 <- c2 <- c3 plus a side commit `side` branching from c1.
 * `racer` runs once, right after the gate's first ls-remote, to move main.
 */
function run({ candidate, live, racer }) {
  const root = mkdtempSync(join(tmpdir(), 'lineage-advancing-'));
  roots.push(root);
  const git = (cwd, ...args) =>
    execFileSync(realGit, args, { cwd, env: gitEnv, encoding: 'utf8' }).trim();
  const work = join(root, 'work');
  const bare = join(root, 'repo.git');
  mkdirSync(work);
  git(work, 'init', '-q', '-b', 'main');
  const commit = name => {
    git(work, 'commit', '--allow-empty', '-qm', name);
    return git(work, 'rev-parse', 'HEAD');
  };
  const c1 = commit('c1');
  const c2 = commit('c2');
  const c3 = commit('c3');
  git(work, 'checkout', '-q', '-b', 'side', c1);
  const side = commit('side');
  git(work, 'checkout', '-q', 'main');
  git(root, 'clone', '-q', '--bare', work, bare);
  git(bare, 'fetch', '-q', work, 'side:refs/heads/side');
  const shas = { c1, c2, c3, side };

  const racerScript = join(root, 'racer.sh');
  const marker = join(root, 'raced');
  const bin = join(root, 'bin');
  mkdirSync(bin);
  if (racer) {
    // After the first ls-remote returns, move main on the remote.
    writeFileSync(
      racerScript,
      racer === 'advance'
        ? `cd "${work}" && "${realGit}" commit --allow-empty -qm c4 && "${realGit}" push -q "${bare}" main:main\n`
        : `cd "${work}" && "${realGit}" checkout -q --orphan rewritten && "${realGit}" commit --allow-empty -qm rewrite && "${realGit}" push -qf "${bare}" rewritten:main\n`
    );
    writeFileSync(
      join(bin, 'git'),
      `#!/bin/bash
"${realGit}" "$@"
status=$?
if [ "$1" = ls-remote ] && [ ! -e "${marker}" ]; then
  touch "${marker}"
  bash "${racerScript}" >/dev/null 2>&1
fi
exit $status
`
    );
    chmodSync(join(bin, 'git'), 0o755);
  }
  const output = join(root, 'output');
  const result = spawnSync('bash', [gate, 'before production promotion'], {
    encoding: 'utf8',
    env: {
      ...gitEnv,
      PATH: `${bin}:${process.env.PATH}`,
      GITHUB_REPOSITORY: 'JovieInc/Jovie',
      GITHUB_OUTPUT: output,
      MAIN_LINEAGE_TRANSPORT: 'git',
      MAIN_LINEAGE_REMOTE: `file://${bare}`,
      EXPECTED_MAIN_SHA: shas[candidate],
      ...(live ? { LIVE_PRODUCTION_SHA: shas[live] } : {}),
    },
  });
  return {
    ...result,
    shas,
    out: existsSync(output) ? readFileSync(output, 'utf8') : '',
  };
}

describe('recheck-main-lineage while main keeps advancing', () => {
  it('promotes a candidate that is an ancestor of the advanced main', () => {
    const r = run({ candidate: 'c2', live: 'c1' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.out).toBe('is_current=true\n');
  });

  it('promotes when main advances again while the lineage is being proven', () => {
    const r = run({ candidate: 'c2', live: 'c1', racer: 'advance' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.out).toBe('is_current=true\n');
    expect(r.stderr).toContain('judging');
  });

  it('refuses a candidate that is not on main lineage', () => {
    const r = run({ candidate: 'side', live: 'c1' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.out).toBe(`superseded_sha=${r.shas.c3}\nis_current=false\n`);
  });

  it('refuses a candidate older than what production serves (no rollback)', () => {
    const r = run({ candidate: 'c1', live: 'c2' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.out).toBe('refusal_reason=older_than_live\nis_current=false\n');
  });

  it('refuses a main-lineage candidate that does not descend from live', () => {
    const r = run({ candidate: 'side', live: 'c2' });
    expect(r.out).toContain('is_current=false');
    expect(r.out).not.toContain('is_current=true');
  });

  it('re-promoting the live SHA itself is allowed', () => {
    const r = run({ candidate: 'c2', live: 'c2' });
    expect(r.out).toBe('is_current=true\n');
  });

  it('deliberate red: fails closed when main is rewritten during the proof', () => {
    const r = run({ candidate: 'c2', live: 'c1', racer: 'rewrite' });
    expect(r.status).not.toBe(0);
    expect(r.out).not.toContain('is_current=true');
    expect(r.stderr).toContain('does not descend');
  });
});

describe('production-release workflow contract', () => {
  const workflow = load(
    readFileSync(
      join(repoRoot, '.github/workflows/production-release.yml'),
      'utf8'
    )
  );
  const step = workflow.jobs['promote-production'].steps.find(
    s => s.name === 'Recheck main immediately before production promotion'
  );

  it('rechecks with git lineage and the live production build-info', () => {
    expect(step.env.MAIN_LINEAGE_TRANSPORT).toBe('git');
    expect(step.env.LIVE_PRODUCTION_BUILD_INFO_URL).toBe(
      'https://jov.ie/api/health/build-info'
    );
    expect(step.run).toContain('recheck-main-lineage.sh');
  });

  it('never requires main to equal the candidate at the promotion boundary', () => {
    expect(step.run).not.toMatch(/!=\s*"\$EXPECTED/);
    const script = readFileSync(gate, 'utf8');
    expect(script).not.toContain(
      'main moved from ${current} to ${tip} while proving'
    );
  });
});
