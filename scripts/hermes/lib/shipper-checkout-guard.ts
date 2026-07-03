import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { withRetry } from './retry';
import { sendTelegram } from './telegram-client';

async function sendSlack(text: string): Promise<boolean> {
  const webhookUrl =
    process.env.HERMES_SLACK_WEBHOOK_URL ?? process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return false;
  try {
    await withRetry(
      async () => {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text.slice(0, 3000) }),
          signal: AbortSignal.timeout(10_000),
        });
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`Slack ${response.status}`);
        }
        if (!response.ok) {
          const err = new Error(`Slack ${response.status}`);
          (err as Error & { permanent?: boolean }).permanent = true;
          throw err;
        }
      },
      { caller: 'slack.send', attempts: 3, baseMs: 300 }
    );
    return true;
  } catch {
    return false;
  }
}

export const SHIPPER_CHECKOUT_EVENT = 'stale_checkout_abort';

/** Paths that must never be auto-reset — shipper control-plane source. */
export const SHIPPER_CRITICAL_PATHS = [
  'scripts/hermes/jobs/codex-issue-shipper.ts',
  'scripts/hermes/lib/codex-issue-shipper.ts',
  'scripts/hermes/lib/ship-ledger.ts',
  'scripts/hermes/lib/shipper-checkout-guard.ts',
  'scripts/hermes/lib/heavy-job-lock.ts',
  'scripts/hermes/shipper-gated-entrypoint.py',
] as const;

export type GitRunner = (
  args: ReadonlyArray<string>,
  options?: { readonly timeoutMs?: number }
) => string;

export interface CheckoutSnapshot {
  readonly branch: string;
  readonly head: string;
  readonly originMain: string;
  readonly dirty: boolean;
  readonly porcelain: string;
  readonly isWorktree: boolean;
}

export interface CheckoutGuardResult {
  readonly ok: boolean;
  readonly recovered: boolean;
  readonly snapshot: CheckoutSnapshot;
  readonly reasons: ReadonlyArray<string>;
}

export interface CheckoutGuardOptions {
  readonly autoRecover?: boolean;
  readonly fetch?: boolean;
  readonly notify?: boolean;
}

function trimOutput(value: string): string {
  return value.trim();
}

export function isGitWorktree(repoRoot: string): boolean {
  const gitEntry = join(repoRoot, '.git');
  if (!existsSync(gitEntry)) return false;
  try {
    return statSync(gitEntry).isFile();
  } catch {
    return false;
  }
}

export function isShipperCriticalPath(path: string): boolean {
  const normalized = path.trim().replace(/^\.\//, '');
  return SHIPPER_CRITICAL_PATHS.some(
    critical => normalized === critical || normalized.startsWith(`${critical}/`)
  );
}

export function dirtyPathsAreOnlyDetritus(porcelain: string): boolean {
  const lines = porcelain
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean);
  if (lines.length === 0) return true;

  for (const line of lines) {
    const payload = line.slice(3).trim();
    const path = payload.includes(' -> ')
      ? (payload.split(' -> ').pop()?.trim() ?? payload)
      : payload;
    if (isShipperCriticalPath(path)) return false;
  }
  return true;
}

export function readCheckoutSnapshot(
  run: GitRunner,
  repoRoot: string
): CheckoutSnapshot {
  const branch = trimOutput(run(['git', '-C', repoRoot, 'branch', '--show-current']));
  const head = trimOutput(run(['git', '-C', repoRoot, 'rev-parse', 'HEAD']));
  const originMain = trimOutput(
    run(['git', '-C', repoRoot, 'rev-parse', 'origin/main'])
  );
  const porcelain = run(['git', '-C', repoRoot, 'status', '--porcelain']);
  return {
    branch,
    head,
    originMain,
    dirty: porcelain.trim().length > 0,
    porcelain,
    isWorktree: isGitWorktree(repoRoot),
  };
}

function checkoutReasons(snapshot: CheckoutSnapshot): string[] {
  const reasons: string[] = [];
  if (snapshot.isWorktree) {
    reasons.push('dispatcher repoRoot is a git worktree, not the primary checkout');
  }
  if (snapshot.branch !== 'main') {
    reasons.push(`branch is ${snapshot.branch || '(detached)'}, expected main`);
  }
  if (snapshot.head !== snapshot.originMain) {
    reasons.push(
      `HEAD ${snapshot.head.slice(0, 12)} != origin/main ${snapshot.originMain.slice(0, 12)}`
    );
  }
  if (snapshot.dirty && !dirtyPathsAreOnlyDetritus(snapshot.porcelain)) {
    reasons.push('working tree has shipper-critical edits');
  }
  return reasons;
}

function canAutoRecover(snapshot: CheckoutSnapshot): boolean {
  if (snapshot.isWorktree) return false;
  if (snapshot.dirty && !dirtyPathsAreOnlyDetritus(snapshot.porcelain)) {
    return false;
  }
  return (
    snapshot.branch !== 'main' ||
    snapshot.head !== snapshot.originMain ||
    snapshot.dirty
  );
}

function autoRecoverCheckout(run: GitRunner, repoRoot: string): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (
    trimOutput(run(['git', '-C', repoRoot, 'status', '--porcelain'])).length > 0
  ) {
    run(
      [
        'git',
        '-C',
        repoRoot,
        'stash',
        'push',
        '-u',
        '-m',
        `shipper-checkout-guard auto-recover ${stamp}`,
      ],
      { timeoutMs: 60_000 }
    );
  }
  run(['git', '-C', repoRoot, 'checkout', 'main'], { timeoutMs: 60_000 });
  run(['git', '-C', repoRoot, 'reset', '--hard', 'origin/main'], {
    timeoutMs: 60_000,
  });
}

export async function notifyStaleCheckoutAbort(details: {
  readonly repoRoot: string;
  readonly reasons: ReadonlyArray<string>;
  readonly snapshot: CheckoutSnapshot;
  readonly recovered: boolean;
}): Promise<void> {
  const { repoRoot, reasons, snapshot, recovered } = details;
  const message = [
    'codex-issue-shipper stale_checkout_abort',
    `repo: ${repoRoot}`,
    `branch: ${snapshot.branch || '(detached)'}`,
    `head: ${snapshot.head.slice(0, 12)}`,
    `origin/main: ${snapshot.originMain.slice(0, 12)}`,
    `worktree: ${snapshot.isWorktree ? 'yes' : 'no'}`,
    `recovered: ${recovered ? 'yes' : 'no'}`,
    'reasons:',
    ...reasons.map(reason => `- ${reason}`),
  ].join('\n');
  await Promise.all([sendTelegram(message), sendSlack(message)]);
}

export function assertPrimaryCheckoutFresh(
  run: GitRunner,
  repoRoot: string,
  options: CheckoutGuardOptions = {}
): CheckoutGuardResult {
  const autoRecover = options.autoRecover ?? true;
  const shouldFetch = options.fetch ?? true;

  if (shouldFetch) {
    run(['git', '-C', repoRoot, 'fetch', 'origin', 'main'], {
      timeoutMs: 120_000,
    });
  }

  let snapshot = readCheckoutSnapshot(run, repoRoot);
  let reasons = checkoutReasons(snapshot);
  if (reasons.length === 0) {
    return { ok: true, recovered: false, snapshot, reasons };
  }

  if (autoRecover && canAutoRecover(snapshot)) {
    autoRecoverCheckout(run, repoRoot);
    snapshot = readCheckoutSnapshot(run, repoRoot);
    reasons = checkoutReasons(snapshot);
    if (reasons.length === 0) {
      return { ok: true, recovered: true, snapshot, reasons: [] };
    }
  }

  return { ok: false, recovered: false, snapshot, reasons };
}