/**
 * Consumer execution plan + memo key for the design CI judge router
 * (JOV-INV-040). Extracted into its own module so the router stays under
 * its size-500 pin; the router re-exports the types for API stability.
 * Deliberately imports nothing from `design-ci-judge-router.ts` — a
 * circular import between these modules is a source-contract violation.
 */
import { resolve as resolvePath } from 'node:path';

export type ConsumerExecutionKind =
  | 'node-test'
  | 'node-cli'
  | 'python'
  | 'bash'
  | 'vitest';

export interface ConsumerExecutionPlan {
  readonly kind: ConsumerExecutionKind;
  /** Repo-relative (or, for vitest, apps/web-relative) path actually run. */
  readonly execPath: string;
}

export function commandFor(
  plan: ConsumerExecutionPlan,
  repoRoot: string
): {
  file: string;
  args: string[];
  cwd: string;
} {
  switch (plan.kind) {
    case 'node-test':
      return {
        file: process.execPath,
        args: ['--test', plan.execPath],
        cwd: repoRoot,
      };
    case 'node-cli':
      return { file: process.execPath, args: [plan.execPath], cwd: repoRoot };
    case 'python':
      return { file: 'python3', args: [plan.execPath], cwd: repoRoot };
    case 'bash':
      return { file: 'bash', args: [plan.execPath], cwd: repoRoot };
    case 'vitest':
      return {
        file: 'pnpm',
        args: [
          'exec',
          'vitest',
          'run',
          '--config=vitest.config.mts',
          plan.execPath,
        ],
        cwd: resolvePath(repoRoot, 'apps/web'),
      };
    default:
      throw new Error(`unreachable consumer kind: ${String(plan.kind)}`);
  }
}

/**
 * The memo key for one consumer execution: the FULL execution plan — the
 * kind, the execPath, and everything `commandFor` derives from them (the
 * executable file, argv, cwd). Two plans share an execution only when all
 * of these are identical. Consumers receive no per-cell input (no cell id
 * reaches argv), and `execFileSync` inherits `process.env` uniformly — no
 * env overrides exist — so nothing per-cell can make two executions with
 * the same key diverge; if a future change introduces either, that input
 * must join this key. Deriving the key from the derived command tuple (not
 * just `kind:execPath`) keeps the memo correct even if `commandFor` grows
 * per-kind argv/cwd/env variation later.
 */
export function consumerExecutionCacheKey(
  plan: ConsumerExecutionPlan,
  repoRoot: string
): string {
  const { file, args, cwd } = commandFor(plan, repoRoot);
  return JSON.stringify([plan.kind, plan.execPath, file, args, cwd]);
}
