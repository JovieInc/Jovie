import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assembleReceipt,
  buildReceipt,
  decideVerdict,
  evaluateGoal,
  evaluateGstack,
  evaluateOwnership,
  evaluateWorktree,
  exitCodeForReceipt,
  SCHEMA,
} from './preflight-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PREFLIGHT_SH = join(HERE, 'preflight.sh');

// ─── Pure unit: worktree ────────────────────────────────────────────────────

test('evaluateWorktree: not a git repo is hard block', () => {
  const r = evaluateWorktree({
    isGitRepo: false,
    porcelainLineCount: 0,
    detached: false,
    branch: null,
    root: null,
  });
  assert.equal(r.worktree.clean, false);
  assert.equal(r.blockers[0].code, 'not_a_git_repo');
});

test('evaluateWorktree: dirty paths hard-block', () => {
  const r = evaluateWorktree({
    isGitRepo: true,
    porcelainLineCount: 3,
    detached: false,
    branch: 'feat/x',
    root: '/repo',
  });
  assert.equal(r.worktree.clean, false);
  assert.equal(r.worktree.dirty_paths, 3);
  assert.equal(r.blockers[0].code, 'worktree_dirty');
  assert.match(r.blockers[0].message, /3 dirty path/);
});

test('evaluateWorktree: detached clean is allowed', () => {
  const r = evaluateWorktree({
    isGitRepo: true,
    porcelainLineCount: 0,
    detached: true,
    branch: 'abc1234',
    root: '/repo',
  });
  assert.equal(r.worktree.clean, true);
  assert.equal(r.worktree.detached, true);
  assert.deepEqual(r.blockers, []);
});

test('evaluateWorktree: clean attached branch is go', () => {
  const r = evaluateWorktree({
    isGitRepo: true,
    porcelainLineCount: 0,
    detached: false,
    branch: 'main',
    root: '/repo',
  });
  assert.equal(r.worktree.clean, true);
  assert.equal(r.worktree.branch, 'main');
  assert.deepEqual(r.blockers, []);
});

// ─── Pure unit: ownership ───────────────────────────────────────────────────

test('evaluateOwnership: missing gbrain soft by default', () => {
  const r = evaluateOwnership({
    gbrainOnPath: false,
    gbrainOutput: null,
  });
  assert.equal(r.ownership.reachable, false);
  assert.equal(r.ownership.source, 'gbrain-missing');
  assert.deepEqual(r.blockers, []);
});

test('evaluateOwnership: missing gbrain hard when required', () => {
  const r = evaluateOwnership({
    gbrainOnPath: false,
    gbrainOutput: null,
    requireGbrain: true,
  });
  assert.equal(r.blockers[0].code, 'gbrain_missing');
});

test('evaluateOwnership: empty gbrain hard when required', () => {
  const r = evaluateOwnership({
    gbrainOnPath: true,
    gbrainOutput: '   ',
    requireGbrain: true,
  });
  assert.equal(r.blockers[0].code, 'gbrain_unreachable');
  assert.equal(r.ownership.source, 'gbrain-empty');
});

test('evaluateOwnership: reachable marks presence only (no invented names)', () => {
  const r = evaluateOwnership({
    gbrainOnPath: true,
    gbrainOutput: 'Owner: Alice the CEO of everything scope: whole company',
    task: 'JOV-4183',
  });
  assert.equal(r.ownership.reachable, true);
  assert.equal(r.ownership.owner, 'available');
  assert.equal(r.ownership.scope, 'JOV-4183');
  assert.equal(r.ownership.source, 'gbrain');
  assert.deepEqual(r.blockers, []);
});

// ─── Pure unit: gstack / goal / verdict / receipt ───────────────────────────

test('evaluateGstack: require missing is hard block', () => {
  const r = evaluateGstack({ binPath: null, requireGstack: true });
  assert.equal(r.gstack.installed, false);
  assert.equal(r.blockers[0].code, 'gstack_missing');
});

test('evaluateGstack: installed carries version fields', () => {
  const r = evaluateGstack({
    binPath: '/x/bin',
    version: '1.2.3',
    latest: '1.3.0',
    policy: 'ask',
  });
  assert.equal(r.gstack.installed, true);
  assert.equal(r.gstack.version, '1.2.3');
  assert.equal(r.gstack.latest, '1.3.0');
  assert.equal(r.gstack.policy, 'ask');
  assert.deepEqual(r.blockers, []);
});

test('evaluateGoal: inactive when no path', () => {
  const r = evaluateGoal({ goalPath: null });
  assert.equal(r.goal.active, false);
  assert.equal(r.goal.id, null);
});

test('evaluateGoal: active with id', () => {
  const r = evaluateGoal({ goalPath: '/g/active.json', goalId: 'goal-1' });
  assert.equal(r.goal.active, true);
  assert.equal(r.goal.id, 'goal-1');
});

test('decideVerdict / exitCodeForReceipt', () => {
  assert.equal(decideVerdict([]), 'go');
  assert.equal(decideVerdict([{ code: 'x', message: 'y' }]), 'blocked');
  assert.equal(exitCodeForReceipt({ verdict: 'go' }), 0);
  assert.equal(exitCodeForReceipt({ verdict: 'blocked' }), 1);
});

test('buildReceipt / assembleReceipt schema and merge', () => {
  const wt = evaluateWorktree({
    isGitRepo: true,
    porcelainLineCount: 0,
    detached: false,
    branch: 'feat',
    root: '/r',
  });
  const own = evaluateOwnership({
    gbrainOnPath: true,
    gbrainOutput: 'ok',
    task: 't',
  });
  const gs = evaluateGstack({ binPath: '/b', version: '0.1' });
  const goal = evaluateGoal({ goalPath: null });

  const receipt = assembleReceipt([wt, own, gs, goal], 42);
  assert.equal(receipt.schema, SCHEMA);
  assert.equal(receipt.verdict, 'go');
  assert.equal(receipt.ms_total, 42);
  assert.equal(receipt.worktree.branch, 'feat');
  assert.equal(receipt.ownership.owner, 'available');
  assert.equal(receipt.gstack.installed, true);
  assert.deepEqual(receipt.blockers, []);

  const blocked = assembleReceipt(
    [
      evaluateWorktree({
        isGitRepo: true,
        porcelainLineCount: 1,
        detached: false,
        branch: 'x',
        root: '/r',
      }),
      own,
    ],
    1
  );
  assert.equal(blocked.verdict, 'blocked');
  assert.equal(blocked.blockers.length, 1);
});

test('buildReceipt uses decideVerdict from blockers only', () => {
  const r = buildReceipt({
    ownership: {
      owner: null,
      scope: null,
      source: 'none',
      reachable: false,
      ms: 0,
    },
    worktree: {
      clean: true,
      detached: false,
      branch: 'm',
      root: '/r',
      dirty_paths: 0,
      ms: 0,
    },
    gstack: {
      installed: false,
      version: null,
      latest: null,
      policy: null,
      path: null,
      ms: 0,
    },
    goal: { active: false, id: null, path: null, ms: 0 },
    blockers: [{ code: 'gstack_missing', message: 'nope' }],
  });
  assert.equal(r.verdict, 'blocked');
});

// ─── CLI integration (shell entrypoint contract) ────────────────────────────

function runPreflight(cwd, env = {}) {
  // Keep PATH minimal so CLI tests don't block on a live gbrain (5s timeout each).
  // Include common git locations; exclude hermes/gbrain bins to avoid 5s timeouts.
  // Append the running node's own bin dir so `node` resolves on runners where it
  // is not installed under a standard prefix (e.g. hosted toolcache/sandboxes).
  const nodeBinDir = dirname(process.execPath);
  const basePath = `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${nodeBinDir}`;
  return spawnSync('bash', [PREFLIGHT_SH], {
    cwd,
    env: {
      ...process.env,
      PATH: basePath,
      AGENT_PREFLIGHT_REQUIRE_GBRAIN: '0',
      AGENT_PREFLIGHT_REQUIRE_GSTACK: '0',
      ...env,
    },
    encoding: 'utf8',
  });
}

test('CLI: emits valid schema JSON from a clean git worktree', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pf-clean-'));
  try {
    const init = spawnSync('git', ['init', '-b', 'main'], {
      cwd: dir,
      encoding: 'utf8',
    });
    assert.equal(init.status, 0, init.stderr);
    spawnSync('git', ['config', 'user.email', 't@t.com'], { cwd: dir });
    spawnSync('git', ['config', 'user.name', 't'], { cwd: dir });
    writeFileSync(join(dir, 'README'), 'x\n');
    spawnSync('git', ['add', 'README'], { cwd: dir });
    spawnSync('git', ['commit', '-m', 'init'], { cwd: dir });

    // Don't require gbrain/gstack for a go verdict in isolation.
    const res = runPreflight(dir, {
      AGENT_PREFLIGHT_REQUIRE_GBRAIN: '0',
      AGENT_PREFLIGHT_REQUIRE_GSTACK: '0',
      PATH: `/usr/bin:/bin:${process.env.PATH ?? ''}`,
    });
    // gbrain may still be on PATH from parent env — that's fine; empty or not.
    const receipt = JSON.parse(res.stdout.trim().split('\n').pop());
    assert.equal(receipt.schema, SCHEMA);
    assert.ok(['go', 'blocked'].includes(receipt.verdict));
    assert.equal(receipt.worktree.clean, true);
    assert.equal(typeof receipt.ms_total, 'number');
    // If only worktree mattered and gbrain not required, should be go unless gbrain forced empty with require.
    if (receipt.blockers.every(b => b.code !== 'worktree_dirty')) {
      assert.equal(receipt.worktree.dirty_paths, 0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: dirty worktree exits 1 with worktree_dirty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pf-dirty-'));
  try {
    spawnSync('git', ['init', '-b', 'main'], { cwd: dir });
    spawnSync('git', ['config', 'user.email', 't@t.com'], { cwd: dir });
    spawnSync('git', ['config', 'user.name', 't'], { cwd: dir });
    writeFileSync(join(dir, 'README'), 'x\n');
    spawnSync('git', ['add', 'README'], { cwd: dir });
    spawnSync('git', ['commit', '-m', 'init'], { cwd: dir });
    writeFileSync(join(dir, 'dirt'), 'dirty\n');

    const res = runPreflight(dir, {
      AGENT_PREFLIGHT_REQUIRE_GBRAIN: '0',
      AGENT_PREFLIGHT_REQUIRE_GSTACK: '0',
    });
    assert.equal(res.status, 1, res.stdout + res.stderr);
    const receipt = JSON.parse(res.stdout.trim().split('\n').pop());
    assert.equal(receipt.verdict, 'blocked');
    assert.ok(receipt.blockers.some(b => b.code === 'worktree_dirty'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: non-git directory exits 1 with not_a_git_repo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pf-nogit-'));
  try {
    const res = runPreflight(dir, {
      AGENT_PREFLIGHT_REQUIRE_GBRAIN: '0',
      AGENT_PREFLIGHT_REQUIRE_GSTACK: '0',
    });
    assert.equal(res.status, 1);
    const receipt = JSON.parse(res.stdout.trim().split('\n').pop());
    assert.equal(receipt.verdict, 'blocked');
    assert.ok(receipt.blockers.some(b => b.code === 'not_a_git_repo'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: --help exits 0', () => {
  const res = spawnSync('bash', [PREFLIGHT_SH, '--help'], {
    encoding: 'utf8',
  });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /preflight/i);
});

// ─── Pure unit: ownership sources + timeout (JOV-4185) ──────────────────────

test('evaluateOwnership: records the lookup source in the receipt', () => {
  for (const source of ['ledger', 'keyword', 'semantic']) {
    const r = evaluateOwnership({
      gbrainOnPath: true,
      gbrainOutput: 'owner context',
      source,
      task: 'JOV-4185',
    });
    assert.equal(r.ownership.source, source);
    assert.equal(r.ownership.reachable, true);
  }
});

test('evaluateOwnership: budget-exhausted lookup records gbrain-timeout', () => {
  const r = evaluateOwnership({
    gbrainOnPath: true,
    gbrainOutput: '',
    timedOut: true,
  });
  assert.equal(r.ownership.source, 'gbrain-timeout');
  assert.equal(r.ownership.reachable, false);
  assert.deepEqual(r.blockers, []);
});

test('evaluateOwnership: timeout hard-blocks when gbrain is required', () => {
  const r = evaluateOwnership({
    gbrainOnPath: true,
    gbrainOutput: '',
    timedOut: true,
    requireGbrain: true,
  });
  assert.equal(r.blockers[0].code, 'gbrain_unreachable');
  assert.match(r.blockers[0].message, /time budget/);
});

// ─── CLI: ownership ledger/keyword-first + hard ceiling (JOV-4185) ──────────

function makeGitRepo(dir) {
  spawnSync('git', ['init', '-b', 'main'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 't@t.com'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 't'], { cwd: dir });
  writeFileSync(join(dir, 'README'), 'x\n');
  spawnSync('git', ['add', 'README'], { cwd: dir });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: dir });
}

function installFakeGbrain(dir, script) {
  const bin = join(dir, 'fake-bin');
  mkdirSync(bin, { recursive: true });
  const path = join(bin, 'gbrain');
  writeFileSync(path, `#!/usr/bin/env bash\n${script}\n`);
  chmodSync(path, 0o755);
  return bin;
}

test('CLI: ownership fast path reads the agent-job-ledger page first', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pf-ledger-'));
  try {
    makeGitRepo(dir);
    const bin = installFakeGbrain(
      dir,
      `if [ "$1" = "get" ] && [ "$2" = "agent-job-ledger" ]; then
  echo "ledger: eve owns triage"
  exit 0
fi
echo "SHOULD_NOT_RUN $1" >&2
exit 1`
    );
    const res = runPreflight(dir, {
      PATH: `${bin}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${dirname(process.execPath)}`,
    });
    const receipt = JSON.parse(res.stdout.trim().split('\n').pop());
    assert.equal(receipt.ownership.source, 'ledger');
    assert.equal(receipt.ownership.reachable, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: ownership falls back to the keyword index when ledger is empty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pf-keyword-'));
  try {
    makeGitRepo(dir);
    const bin = installFakeGbrain(
      dir,
      `if [ "$1" = "get" ]; then exit 0; fi
if [ "$1" = "search" ]; then
  echo "keyword hit: ownership claims"
  exit 0
fi
echo "SEMANTIC_SHOULD_NOT_RUN" >&2
exit 1`
    );
    const res = runPreflight(dir, {
      PATH: `${bin}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${dirname(process.execPath)}`,
    });
    const receipt = JSON.parse(res.stdout.trim().split('\n').pop());
    assert.equal(receipt.ownership.source, 'keyword');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: hanging semantic query is killed inside the hard budget', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pf-hang-'));
  try {
    makeGitRepo(dir);
    // Every gbrain subcommand hangs — the run must still finish quickly.
    const bin = installFakeGbrain(dir, 'sleep 30');
    const t0 = Date.now();
    const res = runPreflight(dir, {
      AGENT_PREFLIGHT_OWNERSHIP_BUDGET_MS: '1500',
      PATH: `${bin}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${dirname(process.execPath)}`,
    });
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 10_000, `preflight took ${elapsed}ms with hung gbrain`);
    const receipt = JSON.parse(res.stdout.trim().split('\n').pop());
    assert.equal(receipt.ownership.source, 'gbrain-timeout');
    assert.equal(receipt.ownership.reachable, false);
    // Timeout is soft unless AGENT_PREFLIGHT_REQUIRE_GBRAIN=1.
    assert.ok(!receipt.blockers.some(b => b.code === 'gbrain_unreachable'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── CLI: gstack pinned / no in-run update-check (JOV-4184) ─────────────────

test('CLI: gstack section never runs update-check and defaults policy to pinned', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pf-gstack-'));
  try {
    makeGitRepo(dir);
    const gstackDir = join(dir, '.claude/skills/gstack');
    const gstackBin = join(gstackDir, 'bin');
    mkdirSync(gstackBin, { recursive: true });
    writeFileSync(join(gstackDir, 'VERSION'), '1.2.3\n');
    writeFileSync(join(gstackBin, 'gstack-config'), '#!/usr/bin/env bash\nexit 1\n');
    chmodSync(join(gstackBin, 'gstack-config'), 0o755);
    const canary = join(dir, 'update-check-ran');
    writeFileSync(
      join(gstackBin, 'gstack-update-check'),
      `#!/usr/bin/env bash\ntouch "${canary}"\necho "UPGRADE_AVAILABLE 1.2.3 9.9.9"\n`
    );
    chmodSync(join(gstackBin, 'gstack-update-check'), 0o755);

    const stateDir = join(dir, 'gstack-state');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, 'last-update-check'), 'UPGRADE_AVAILABLE 1.2.3 2.0.0\n');

    const res = runPreflight(dir, { GSTACK_STATE_DIR: stateDir });
    const receipt = JSON.parse(res.stdout.trim().split('\n').pop());
    assert.equal(receipt.gstack.installed, true);
    assert.equal(receipt.gstack.version, '1.2.3');
    assert.equal(receipt.gstack.policy, 'pinned');
    // latest comes from the cached state file, read-only…
    assert.equal(receipt.gstack.latest, '2.0.0');
    // …and the network-touching update-check binary was never invoked.
    assert.ok(!existsSync(canary), 'gstack-update-check ran during preflight');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
