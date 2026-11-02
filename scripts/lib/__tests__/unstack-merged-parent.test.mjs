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
function fixture({
  childConflicts = false,
  parentMerged = true,
  parentBase = 'main',
  activeClaim = '',
  policyCheckout = false,
  commentOverride = false,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'unstack-'));
  dirs.push(dir);
  const remote = join(dir, 'remote.git');
  const work = join(dir, 'work');
  git(dir, 'init', '-q', '--bare', '-b', 'main', remote);
  git(dir, 'clone', '-q', remote, work);
  git(work, 'checkout', '-q', '-b', 'main');
  if (policyCheckout) {
    const archive = execFileSync(
      'git',
      [
        'archive',
        'HEAD',
        'scripts/lanes',
        'scripts/apiclient',
        'packages/api-client/providers.json',
        'scripts/lib/gh-retry.sh',
        'scripts/lib/upsert-pr-comment.sh',
      ],
      { cwd: repoRoot, maxBuffer: 8 * 1024 * 1024 }
    );
    execFileSync('tar', ['-x', '-C', work], { input: archive });
    writeFileSync(
      join(work, 'scripts/unstack-merged-parent.sh'),
      readFileSync(script)
    );
    git(work, 'add', 'scripts', 'packages');
  }
  commitFile(work, 'base.txt', 'base\n', 'base');
  git(work, 'push', '-q', 'origin', 'main');

  git(work, 'checkout', '-q', '-b', 'parent');
  commitFile(work, 'parent.txt', 'p1\n', 'P1');
  const parentTip = commitFile(work, 'parent.txt', 'p1\np2\n', 'P2');
  git(work, 'checkout', '-q', '-b', 'child');
  const childFile = childConflicts ? 'parent.txt' : 'child.txt';
  let childSha = commitFile(work, childFile, 'child\n', 'C1');
  if (policyCheckout) {
    childSha = commitFile(
      work,
      'scripts/lanes/pr_events.py',
      `from pathlib import Path\nPath(${JSON.stringify(join(dir, 'child-policy-executed'))}).write_text('unsafe')\nraise RuntimeError('child policy executed')\n`,
      'child policy override'
    );
  }
  if (commentOverride) {
    childSha = commitFile(
      work,
      'scripts/lib/upsert-pr-comment.sh',
      `#!/usr/bin/env bash\nprintf unsafe > '${join(dir, 'child-comment-executed')}'\n`,
      'child comment override'
    );
  }
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
      comments: activeClaim
        ? [
            {
              body: `🤖 lane claim kind=${activeClaim} sha=${childSha} host=gem at=${new Date().toISOString()}`,
              user: { login: 'jovie-bot[bot]', type: 'Bot' },
            },
          ]
        : [],
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
            base: { ref: parentBase },
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
  if [[ -f "$D/state-fault" ]]; then cat "$D/state-fault"; exit 0; fi
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
elif [[ "$1" == "api" && "$*" == *"/comments"* ]]; then
  if [[ -f "$D/claim-fault" ]]; then exit "$(cat "$D/claim-fault")"; fi
  number=""
  for arg in "$@"; do
    if [[ "$arg" == *"/issues/"*"/comments"* ]]; then number="\${arg#*/issues/}"; number="\${number%%/*}"; fi
    if [[ "$arg" == -i || "$arg" == --include ]]; then printf 'HTTP/2 200\\ncontent-type: application/json\\n\\n'; fi
  done
  jq -c --arg n "$number" '.[$n].comments // []' "$D/prs.json" | emit
fi
`
  );
  chmodSync(join(dir, 'gh'), 0o755);
  return {
    dir,
    remote,
    work,
    parentTip,
    childSha,
    grandSha,
    script: policyCheckout
      ? join(work, 'scripts/unstack-merged-parent.sh')
      : script,
  };
}

function run(fx, env = {}) {
  return spawnSync('bash', [fx.script], {
    cwd: fx.work,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fx.dir}:${process.env.PATH}`,
      REPO: 'JovieInc/Jovie',
      CHILD_PR: '11',
      GH_RETRY_ATTEMPTS: '1',
      GH_TOKEN: 'unstack-fixture-token',
      GITHUB_TOKEN: '',
      LANES_STATE: join(fx.dir, 'state'),
      JOVIE_API_STATE_DIR: join(fx.dir, 'state'),
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

function afterRebase(fx, body) {
  const hook = join(fx.work, '.git/hooks/post-rewrite');
  writeFileSync(
    hook,
    `#!/usr/bin/env bash\nset -euo pipefail\n[[ "$1" == rebase ]] || exit 0\n${body}\n`
  );
  chmodSync(hook, 0o755);
}

function changePrAfterRebase(fx, expression) {
  afterRebase(
    fx,
    `jq '${expression}' '${fx.dir}/prs.json' > '${fx.dir}/next.json'\nmv '${fx.dir}/next.json' '${fx.dir}/prs.json'`
  );
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
    for (const number of [11, 12]) {
      expect(
        calls.split('\n').filter(line => line.startsWith(`pr view ${number} `))
      ).toHaveLength(2);
      expect(
        calls
          .split('\n')
          .filter(line => line.includes(`/issues/${number}/comments?`))
      ).toHaveLength(2);
    }
  });

  it('leaves the stack alone when the parent closed without merging', () => {
    const fx = fixture({ parentMerged: false });
    const result = run(fx);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('has no merged parent PR');
    expect(git(fx.remote, 'rev-parse', 'child')).toBe(fx.childSha);
  });

  it('preserves children when the parent merged into a feature branch', () => {
    const fx = fixture({ parentBase: 'feature' });
    const result = run(fx);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(git(fx.remote, 'rev-parse', 'child')).toBe(fx.childSha);
    expect(git(fx.remote, 'rev-parse', 'grandchild')).toBe(fx.grandSha);
    expect(readFileSync(join(fx.dir, 'calls.log'), 'utf8')).not.toContain(
      'pr edit'
    );
  });

  it('aborts on conflict without rewriting the branch', () => {
    const fx = fixture({ childConflicts: true });
    const result = run(fx);
    expect(result.status).toBe(0);
    expect(git(fx.remote, 'rev-parse', 'child')).toBe(fx.childSha);
    const calls = readFileSync(join(fx.dir, 'calls.log'), 'utf8');
    expect(calls).not.toContain('pr edit');
  });

  it.each(['fix', 'gate', 'adopt'])(
    'leaves an exact-head %s claim with its incumbent writer',
    kind => {
      const fx = fixture({ activeClaim: kind });
      const result = run(fx);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(git(fx.remote, 'rev-parse', 'child')).toBe(fx.childSha);
      expect(git(fx.remote, 'rev-parse', 'grandchild')).toBe(fx.grandSha);
      expect(readFileSync(join(fx.dir, 'calls.log'), 'utf8')).not.toContain(
        'pr edit'
      );
    }
  );

  it.each(['hold', 'gated', 'incident', 'queue-deferred'])(
    'preserves %s applied after rebase but before publication',
    label => {
      const fx = fixture();
      changePrAfterRebase(fx, `.["11"].labels = [{"name":"${label}"}]`);
      const result = run(fx);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      const live = JSON.parse(readFileSync(join(fx.dir, 'prs.json'), 'utf8'));
      expect(live[11].labels).toEqual([{ name: label }]);
      expect(git(fx.remote, 'rev-parse', 'child')).toBe(fx.childSha);
      expect(git(fx.remote, 'rev-parse', 'grandchild')).toBe(fx.grandSha);
      expect(readFileSync(join(fx.dir, 'calls.log'), 'utf8')).not.toContain(
        'pr edit'
      );
    }
  );

  it('refuses a new exact-head claim acquired during the local rebase', () => {
    const fx = fixture();
    const body = `🤖 lane claim kind=fix sha=${fx.childSha} host=gem at=${new Date().toISOString()}`;
    changePrAfterRebase(
      fx,
      `.["11"].comments = [{"body":${JSON.stringify(body)}}]`
    );
    const result = run(fx);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(git(fx.remote, 'rev-parse', 'child')).toBe(fx.childSha);
    expect(git(fx.remote, 'rev-parse', 'grandchild')).toBe(fx.grandSha);
  });

  it('does not treat another head or expired canonical claim as current custody', () => {
    const fx = fixture();
    const path = join(fx.dir, 'prs.json');
    const prs = JSON.parse(readFileSync(path, 'utf8'));
    prs[11].comments = [
      {
        body: `🤖 lane claim kind=fix sha=${'0'.repeat(40)} host=gem at=${new Date().toISOString()}`,
      },
      {
        body: `🤖 lane claim kind=fix sha=${fx.childSha} host=gem at=2000-01-01T00:00:00Z`,
      },
    ];
    writeFileSync(path, JSON.stringify(prs));
    const result = run(fx);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(remoteLog(fx, 'main..child')).toEqual(['C1']);
    expect(remoteLog(fx, 'child..grandchild')).toEqual(['G1']);
  });

  it('uses trusted committed policy after checking out child policy overrides', () => {
    const fx = fixture({ policyCheckout: true });
    changePrAfterRebase(fx, '.["11"].labels = [{"name":"hold"}]');
    const result = run(fx);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(git(fx.remote, 'rev-parse', 'child')).toBe(fx.childSha);
    expect(() => readFileSync(join(fx.dir, 'child-policy-executed'))).toThrow(
      /ENOENT/
    );
    expect(
      readFileSync(join(fx.work, 'scripts/lanes/pr_events.py'), 'utf8')
    ).toContain('child policy executed');
  });

  it.each([false, true])(
    'uses the trusted comment helper after child checkout (conflict=%s)',
    childConflicts => {
      const fx = fixture({
        policyCheckout: true,
        commentOverride: true,
        childConflicts,
      });
      const result = run(fx);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(() =>
        readFileSync(join(fx.dir, 'child-comment-executed'))
      ).toThrow(/ENOENT/);
      expect(readFileSync(join(fx.dir, 'calls.log'), 'utf8')).toContain(
        'pr comment 11 --body'
      );
      expect(git(fx.remote, 'rev-parse', 'child') === fx.childSha).toBe(
        childConflicts
      );
    }
  );

  it.each([1, 75])(
    'refuses unreadable or deferred claim evidence (exit %s)',
    code => {
      const fx = fixture();
      writeFileSync(join(fx.dir, 'claim-fault'), String(code));
      const result = run(fx);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(git(fx.remote, 'rev-parse', 'child')).toBe(fx.childSha);
      expect(git(fx.remote, 'rev-parse', 'grandchild')).toBe(fx.grandSha);
      expect(readFileSync(join(fx.dir, 'calls.log'), 'utf8')).not.toContain(
        'pr edit'
      );
    }
  );

  it.each([
    '.["11"].headRefOid = "0000000000000000000000000000000000000000"',
    '.["11"].baseRefName = "new-parent"',
    '.["11"].headRefName = "new-branch"',
    'del(.["11"].labels)',
  ])('refuses changed or incomplete publication identity: %s', expression => {
    const fx = fixture();
    changePrAfterRebase(fx, expression);
    const result = run(fx);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(git(fx.remote, 'rev-parse', 'child')).toBe(fx.childSha);
    expect(git(fx.remote, 'rev-parse', 'grandchild')).toBe(fx.grandSha);
  });

  it('fails closed when the final metadata response is unreadable', () => {
    const fx = fixture();
    afterRebase(fx, `printf 'not JSON' > '${fx.dir}/state-fault'`);
    const result = run(fx);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(git(fx.remote, 'rev-parse', 'child')).toBe(fx.childSha);
  });

  it('is idempotent: the retarget wake after a successful unstack is a no-op', () => {
    const fx = fixture();
    expect(run(fx).status).toBe(0);
    const rebased = git(fx.remote, 'rev-parse', 'child');
    const prs = JSON.parse(readFileSync(join(fx.dir, 'prs.json'), 'utf8'));
    prs[11] = { ...prs[11], headRefOid: rebased, baseRefName: 'main' };
    writeFileSync(join(fx.dir, 'prs.json'), JSON.stringify(prs));
    const again = run(fx, { OLD_BASE_REF: 'parent' });
    expect(again.status, again.stdout + again.stderr).toBe(0);
    expect(again.stdout).toContain('already unstacked');
    expect(git(fx.remote, 'rev-parse', 'child')).toBe(rebased);
  });

  it('dry-run pushes nothing', () => {
    const fx = fixture();
    const result = run(fx, { DRY_RUN: '1' });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(git(fx.remote, 'rev-parse', 'child')).toBe(fx.childSha);
    expect(git(fx.remote, 'rev-parse', 'grandchild')).toBe(fx.grandSha);
  });

  it('wakes on a merged parent or a retarget to main, on trusted main code', () => {
    expect(workflow).toContain('types: [edited, closed]');
    expect(workflow).toContain("github.event.changes.base.ref.from != ''");
    expect(workflow).toContain("github.event.pull_request.base.ref == 'main'");
    expect(workflow).toContain('github.event.pull_request.merged == true');
    expect(workflow).toContain(
      'github.event.pull_request.head.repo.full_name == github.repository'
    );
    expect(workflow).toContain('-f base="$MERGED_HEAD_REF"');
    expect(workflow).toContain(
      'group: unstack-merged-parent-${{ matrix.child }}'
    );
    expect(workflow).toContain('ref: main');
    expect(workflow).toContain(
      '# controller-hop-exception: jovie-controller-hop/v1'
    );
    // Admission goes through green enroll's per-PR dispatch and is frozen with the queue.
    expect(workflow).toContain("vars.QUEUE_FREEZE != '1'");
    expect(workflow).not.toContain('--auto');
  });

  it('hands the unstacked child to green enroll and never writes the queue itself', () => {
    const fx = fixture();
    const result = run(fx, { DRY_RUN: '1', ADMIT_AFTER_UNSTACK: '1' });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('would dispatch green enroll for #11');
    const source = readFileSync(script, 'utf8');
    expect(source).not.toMatch(/enqueuePullRequest|enablePullRequestAutoMerge/);
    expect(source).not.toMatch(/pr merge[^\n]*--auto/);
    expect(git(fx.remote, 'rev-parse', 'child')).toBe(fx.childSha);
  });
});
