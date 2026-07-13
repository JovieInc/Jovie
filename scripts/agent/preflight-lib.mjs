/**
 * Pure preflight evaluation + receipt builder (JOV-4183).
 * Orchestration (git/gbrain/exec) lives in preflight.mjs / preflight.sh.
 */

export const SCHEMA = 'agent-preflight/v1';

/**
 * @typedef {{ code: string, message: string }} Blocker
 * @typedef {{
 *   clean: boolean,
 *   detached: boolean,
 *   branch: string | null,
 *   root: string | null,
 *   dirty_paths: number,
 *   ms?: number,
 * }} WorktreeInput
 */

/**
 * @param {{
 *   isGitRepo: boolean,
 *   porcelainLineCount: number,
 *   detached: boolean,
 *   branch: string | null,
 *   root: string | null,
 *   ms?: number,
 * }} input
 */
export function evaluateWorktree(input) {
  /** @type {Blocker[]} */
  const blockers = [];
  if (!input.isGitRepo) {
    blockers.push({
      code: 'not_a_git_repo',
      message: 'Not inside a git repository.',
    });
    return {
      worktree: {
        clean: false,
        detached: false,
        branch: null,
        root: null,
        dirty_paths: 0,
        ms: input.ms ?? 0,
      },
      blockers,
    };
  }

  const dirty = input.porcelainLineCount > 0;
  if (dirty) {
    blockers.push({
      code: 'worktree_dirty',
      message: `Worktree has ${input.porcelainLineCount} dirty path(s); commit, stash, or discard before autoplan.`,
    });
  }

  return {
    worktree: {
      // Detached clean worktrees are allowed (JOV-4183 acceptance).
      clean: !dirty,
      detached: Boolean(input.detached),
      branch: input.branch,
      root: input.root,
      dirty_paths: input.porcelainLineCount,
      ms: input.ms ?? 0,
    },
    blockers,
  };
}

/**
 * Ownership lookup sources, in preference order (JOV-4185):
 *   'ledger'   — direct read of the gbrain agent-job-ledger page (deterministic)
 *   'keyword'  — keyword index search (fast, deterministic ranking)
 *   'semantic' — hybrid/semantic query (only when keyword was empty; hard-capped)
 * Legacy 'gbrain' is retained as the default label for untagged output.
 *
 * @param {{
 *   gbrainOnPath: boolean,
 *   gbrainOutput: string | null,
 *   source?: 'ledger' | 'keyword' | 'semantic' | 'gbrain' | null,
 *   timedOut?: boolean,
 *   requireGbrain?: boolean,
 *   task?: string | null,
 *   ms?: number,
 * }} input
 */
export function evaluateOwnership(input) {
  /** @type {Blocker[]} */
  const blockers = [];
  const requireGbrain = Boolean(input.requireGbrain);
  const task = input.task?.trim() || null;

  if (!input.gbrainOnPath) {
    if (requireGbrain) {
      blockers.push({
        code: 'gbrain_missing',
        message: 'gbrain CLI not on PATH (AGENT_PREFLIGHT_REQUIRE_GBRAIN=1).',
      });
    }
    return {
      ownership: {
        owner: null,
        scope: task || null,
        source: 'gbrain-missing',
        reachable: false,
        ms: input.ms ?? 0,
      },
      blockers,
    };
  }

  const out = (input.gbrainOutput ?? '').trim();
  if (!out) {
    const timedOut = Boolean(input.timedOut);
    if (requireGbrain) {
      blockers.push({
        code: 'gbrain_unreachable',
        message: timedOut
          ? 'gbrain ownership lookup exceeded the hard time budget (AGENT_PREFLIGHT_REQUIRE_GBRAIN=1).'
          : 'gbrain returned empty ownership context (AGENT_PREFLIGHT_REQUIRE_GBRAIN=1).',
      });
    }
    return {
      ownership: {
        owner: null,
        scope: task || null,
        source: timedOut ? 'gbrain-timeout' : 'gbrain-empty',
        reachable: false,
        ms: input.ms ?? 0,
      },
      blockers,
    };
  }

  // Do not invent owner names from free-text hits — mark presence only.
  return {
    ownership: {
      owner: 'available',
      scope: task || 'repo',
      source: input.source || 'gbrain',
      reachable: true,
      ms: input.ms ?? 0,
    },
    blockers,
  };
}

/**
 * @param {{
 *   binPath: string | null,
 *   version?: string | null,
 *   latest?: string | null,
 *   policy?: string | null,
 *   requireGstack?: boolean,
 *   ms?: number,
 * }} input
 */
export function evaluateGstack(input) {
  /** @type {Blocker[]} */
  const blockers = [];
  const installed = Boolean(input.binPath);
  if (!installed && input.requireGstack) {
    blockers.push({
      code: 'gstack_missing',
      message: 'gstack bin not found (AGENT_PREFLIGHT_REQUIRE_GSTACK=1).',
    });
  }
  return {
    gstack: {
      installed,
      version: installed ? (input.version ?? null) : null,
      latest: installed ? (input.latest ?? null) : null,
      policy: installed ? (input.policy ?? null) : null,
      path: input.binPath,
      ms: input.ms ?? 0,
    },
    blockers,
  };
}

/**
 * @param {{
 *   goalPath: string | null,
 *   goalId?: string | null,
 *   ms?: number,
 * }} input
 */
export function evaluateGoal(input) {
  const active = Boolean(input.goalPath);
  return {
    goal: {
      active,
      id: active ? (input.goalId ?? null) : null,
      path: input.goalPath,
      ms: input.ms ?? 0,
    },
    blockers: /** @type {Blocker[]} */ ([]),
  };
}

/**
 * @param {Blocker[]} blockers
 * @returns {'go' | 'blocked'}
 */
export function decideVerdict(blockers) {
  return blockers.length > 0 ? 'blocked' : 'go';
}

/**
 * @param {{
 *   ownership: object,
 *   worktree: object,
 *   gstack: object,
 *   goal: object,
 *   blockers: Blocker[],
 *   ms_total?: number,
 * }} parts
 */
export function buildReceipt(parts) {
  const blockers = Array.isArray(parts.blockers) ? parts.blockers : [];
  return {
    schema: SCHEMA,
    ownership: parts.ownership,
    worktree: parts.worktree,
    gstack: parts.gstack,
    goal: parts.goal,
    verdict: decideVerdict(blockers),
    blockers,
    ms_total: parts.ms_total ?? 0,
  };
}

/**
 * Merge section results into one receipt.
 * @param {Array<{ ownership?: object, worktree?: object, gstack?: object, goal?: object, blockers?: Blocker[] }>} sections
 * @param {number} [msTotal]
 */
export function assembleReceipt(sections, msTotal = 0) {
  /** @type {Blocker[]} */
  const blockers = [];
  let ownership = {
    owner: null,
    scope: null,
    source: 'none',
    reachable: false,
    ms: 0,
  };
  let worktree = {
    clean: false,
    detached: false,
    branch: null,
    root: null,
    dirty_paths: 0,
    ms: 0,
  };
  let gstack = {
    installed: false,
    version: null,
    latest: null,
    policy: null,
    path: null,
    ms: 0,
  };
  let goal = { active: false, id: null, path: null, ms: 0 };

  for (const s of sections) {
    if (s.ownership) ownership = s.ownership;
    if (s.worktree) worktree = s.worktree;
    if (s.gstack) gstack = s.gstack;
    if (s.goal) goal = s.goal;
    if (s.blockers?.length) blockers.push(...s.blockers);
  }

  return buildReceipt({
    ownership,
    worktree,
    gstack,
    goal,
    blockers,
    ms_total: msTotal,
  });
}

/**
 * Exit code for a receipt (skill contract).
 * @param {{ verdict: string }} receipt
 */
export function exitCodeForReceipt(receipt) {
  return receipt.verdict === 'blocked' ? 1 : 0;
}
