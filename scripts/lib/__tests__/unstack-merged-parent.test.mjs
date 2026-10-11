import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const script = resolve(repoRoot, 'scripts/unstack-merged-parent.sh');
const workflow = readFileSync(
  resolve(repoRoot, '.github/workflows/unstack-merged-parent.yml'),
  'utf8'
);

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
    },
  }).trim();
}

function commitFile(cwd, file, content, message) {
  writeFileSync(join(cwd, file), content);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

/**
 * main: base -> squash(parent) -> unrelated
 * parent (PR 10, merged): base -> P1 -> P2
 * child (PR 11): P2 -> C1           (stacked on parent)
 * grandchild (PR 12): C1 -> G1      (stacked on child)
 */
function fixture({ childConflicts = false, parentMerged = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'unstack-'));
  dirs.push(dir);
  const remote = join(dir, 'remote.git');
  const work = join(dir, 'work');
  git(dir, 'init', '-q', '--bare', '-b', 'main', remote);
  git(dir, 'clone', '-q', remote, work);
  git(work, 'checkout', '-q', '-b', 'main');
  commitFile(work, 'base.txt', 'base\n', 'base');
  git(work, 'push', '-q', 'origin', 'main');

  git(work, 'checkout', '-q', '-b', 'parent');
  commitFile(work, 'parent.txt', 'p1\n', 'P1');
  const parentTip = commitFile(work, 'parent.txt', 'p1\np2\n', 'P2');
  git(work, 'checkout', '-q', '-b', 'child');
  const childFile = childConflicts ? 'parent.txt' : 'child.txt';
  const childSha = commitFile(work, childFile, 'child\n', 'C1');
  git(work, 'checkout', '-q', '-b', 'grandchild');
  const grandSha = commitFile(work, 'grand.txt', 'g\n', 'G1');

  git(work, 'checkout', '-q', 'main');
  if (childConflicts) {
    // main later rewrites the same line the child touched.
    commitFile(work, 'parent.txt', 'p1\np2\n', 'squash parent');
    commitFile(work, 'parent.txt', 'rewritten on main\n', 'main edit');
  } else {
    commitFile(work, 'parent.txt', 'p1\np2\n', 'squash parent');
    commitFile(work, 'other.txt', 'x\n', 'unrelated');
  }
  git(
    work,
    'push',
    '-q',
    'origin',
    'main',
    'parent',
    'child',
    'grandchild',
    `${parentTip}:refs/pull/10/head`
  );

  const prs = {
    11: {
      number: 11,
      state: 'OPEN',
      isDraft: true,
      isCrossRepository: false,
      headRefName: 'child',
      headRefOid: childSha,
      baseRefName: 'parent',
      labels: [],
    },
    12: {
      number: 12,
      state: 'OPEN',
      isDraft: true,
      isCrossRepository: false,
      headRefName: 'grandchild',
      headRefOid: grandSha,
      baseRefName: 'child',
      labels: [],
    },
  };
  const closedByHead = parentMerged
    ? {
        parent: [
          {
            number: 10,
            merged_at: '2026-10-01T00:00:00Z',
            head: { sha: parentTip },
          },
        ],
      }
    : { parent: [{ number: 10, merged_at: null, head: { sha: parentTip } }] };
  writeFileSync(join(dir, 'prs.json'), JSON.stringify(prs));
  writeFileSync(join(dir, 'closed.json'), JSON.stringify(closedByHead));
  writeFileSync(
    join(dir, 'gh'),
    `#!/usr/bin/env bash
set -euo pipefail
D="${dir}"
echo "$*" >> "$D/calls.log"
args=("$@")
jq_expr=""
for ((i=0; i<\${#args[@]}; i++)); do
  if [[ "\${args[$i]}" == "--jq" ]]; then jq_expr="\${args[$((i+1))]}"; fi
done
emit() { if [[ -n "$jq_expr" ]]; then jq -r "$jq_expr"; else cat; fi; }
if [[ "$1 $2" == "pr view" ]]; then
  jq -c --arg n "$3" '.[$n]' "$D/prs.json" | emit
elif [[ "$1 $2" == "pr list" ]]; then
  base=""
  for ((i=0; i<\${#args[@]}; i++)); do
    if [[ "\${args[$i]}" == "--base" ]]; then base="\${args[$((i+1))]}"; fi
  done
  jq -c --arg b "$base" '[.[] | select(.baseRefName == $b)]' "$D/prs.json" | emit
elif [[ "$1" == "api" && "$2" == *"pulls?state=closed"* ]]; then
  head="\${2#*head=}"; head="\${head#*:}"; head="\${head%%&*}"
  jq -c --arg h "$head" '.[$h] // []' "$D/closed.json" | emit
fi
`
  );
  chmodSync(join(dir, 'gh'), 0o755);
  return { dir, remote, work, parentTip, childSha, grandSha };
}

function run(fx, env = {}) {
  return spawnSync('bash', [script], {
    cwd: fx.work,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fx.dir}:${process.env.PATH}`,
      REPO: 'JovieInc/Jovie',
      CHILD_PR: '11',
      GH_RETRY_ATTEMPTS: '1',
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
      ...env,
    },
  });
}

function remoteLog(fx, range) {
  return git(fx.remote, 'log', '--format=%s', range)
    .split('\n')
    .filter(Boolean);
}

describe('unstack-merged-parent.sh', () => {
  it('rebases only the child commits onto main, retargets, and restacks the chain', () => {
    const fx = fixture();
    const result = run(fx);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(remoteLog(fx, 'main..child')).toEqual(['C1']);
    expect(remoteLog(fx, 'child..grandchild')).toEqual(['G1']);
    expect(git(fx.remote, 'merge-base', '--is-ancestor', 'main', 'child')).toBe(
      ''
    );
    const calls = readFileSync(join(fx.dir, 'calls.log'), 'utf8');
    expect(calls).toContain('pr edit 11 -R JovieInc/Jovie --base main');
    expect(calls).not.toContain('pr edit 12');
    expect(calls).not.toMatch(/merge .*--auto|pr close|pr ready/);
  });

  it('leaves the stack alone when the parent closed without merging', () => {
    const fx = fixture({ parentMerged: false });
    const result = run(fx);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('has no merged parent PR');
    expect(git(fx.remote, 'rev-parse', 'child')).toBe(fx.childSha);
  });

  it('aborts on conflict without rewriting the branch', () => {
    const fx = fixture({ childConflicts: true });
    const result = run(fx);
    expect(result.status).toBe(0);
    expect(git(fx.remote, 'rev-parse', 'child')).toBe(fx.childSha);
    const calls = readFileSync(join(fx.dir, 'calls.log'), 'utf8');
    expect(calls).not.toContain('pr edit');
  });

  it('dry-run pushes nothing', () => {
    const fx = fixture();
    const result = run(fx, { DRY_RUN: '1' });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(git(fx.remote, 'rev-parse', 'child')).toBe(fx.childSha);
    expect(git(fx.remote, 'rev-parse', 'grandchild')).toBe(fx.grandSha);
  });

  it('wakes only on a retarget to main or a manual dispatch, on trusted main code', () => {
    expect(workflow).toContain('pull_request_target:\n    types: [edited]');
    expect(workflow).toContain("github.event.changes.base.ref.from != ''");
    expect(workflow).toContain("github.event.pull_request.base.ref == 'main'");
    expect(workflow).toContain('ref: main');
    expect(workflow).toContain(
      '# controller-hop-exception: jovie-controller-hop/v1'
    );
    expect(workflow).not.toContain('--auto');
  });
});
