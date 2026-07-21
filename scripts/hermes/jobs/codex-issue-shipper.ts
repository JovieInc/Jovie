#!/usr/bin/env tsx
/**
 * Codex Issue Shipper — Hermes-Air
 *
 * Watches all open GitHub issues (not just codex-labeled), claims one
 * eligible issue, writes dispatch context to gbrain, then starts a
 * coder-profile agent to ship it.
 *
 * Issues labeled `no-auto`, `invalid` (confirmed misroutes), `type:epic`
 * (pointer trackers with no code), or already claimed/blocked are excluded.
 * All other open issues are dispatchable.
 *
 * The empty-queue path is intentionally cheap: GitHub scan, log, exit. No
 * gbrain query, model call, subagent, or CodeRabbit work happens unless an
 * issue is eligible and claimed.
 */

import { execFileSync, spawn } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism, freemem, loadavg, tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildAgentCommand,
  buildAgentPrompt,
  buildDispatchPlans,
  buildGbrainCaptureText,
  buildGbrainQuery,
  buildRecoveryStashMessage,
  buildRetryEscalationReason,
  type CheckoutState,
  CODEX_BLOCKED_LABEL,
  CODEX_CLAIM_LABEL,
  CODEX_TRUSTED_LABEL,
  countRetryReleases,
  type DispatchPlan,
  EPIC_LABEL,
  type FinisherRunner,
  finishDispatch,
  type GbrainContext,
  GhEagainBackoff,
  type GithubIssue,
  gbrainContextBlocker,
  HUMAN_REVIEW_LABEL,
  type IssueComment,
  isAlreadyClaimedOrBlocked,
  labelNames,
  loadShipperConfig,
  NO_AUTO_LABEL,
  parseAgentChain,
  parseDirtyPaths,
  planCheckoutGate,
  RETRY_RELEASE_COMMENT_HEADER,
  routeForAgent,
  type ShipperConfig,
  SpawnEagainError,
  shouldEscalateRetry,
  worktreeHasWork,
} from '../lib/codex-issue-shipper';
import { tryWithHeavyJobLock } from '../lib/heavy-job-lock';
import { HERMES_PATHS } from '../lib/hermes-paths';
import { logJobEvent, withJobLogging } from '../lib/jobs-log';
import { sendOpsAlert } from '../lib/ops-notify';
import {
  journalEnd,
  journalStart,
  planRecovery,
  readJournal,
  SHIP_OWNER_LOCK,
} from '../lib/ship-ledger';
import {
  isSpawnResourceUnavailable,
  SpawnResourceGuard,
  SpawnResourceUnavailableError,
} from '../lib/spawn-resource';

const JOB = 'codex-issue-shipper';
const ghEagainBackoff = new GhEagainBackoff();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleSpawnEagain(
  err: SpawnEagainError,
  context: string
): Promise<void> {
  const backoff = ghEagainBackoff.record();
  logJobEvent({
    job: JOB,
    event: 'gh_eagain_skip',
    context,
    command: err.command,
    error: err.message,
    consecutive: backoff.consecutive,
  });
  if (backoff.shouldBackoff) {
    logJobEvent({
      job: JOB,
      event: 'gh_eagain_backoff',
      sleepMs: backoff.sleepMs,
      consecutive: backoff.consecutive,
    });
    await sleep(backoff.sleepMs);
  }
}

const spawnResourceGuard = new SpawnResourceGuard({
  onEvent: entry => logJobEvent({ job: JOB, ...entry }),
});

/**
 * Sentinel file that, when present, pauses the shipper.
 * Written by the Shipping Menu Bar ops tool (or `touch ~/.hermes/shipping-paused`).
 * Removed to resume. Lets an operator halt all autonomous dispatch without
 * unloading the LaunchAgent or touching env vars.
 */
const PAUSE_SENTINEL = join(HERMES_HOME(), 'shipping-paused');

function HERMES_HOME(): string {
  return process.env.HERMES_HOME ?? join(tmpdir(), '..', 'timwhite', '.hermes');
}

interface AgentRunResult {
  readonly ok: boolean;
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly error?: string;
  readonly logPath: string;
  readonly promptPath: string;
  readonly statePath: string;
}

interface AgentAttemptState {
  readonly job: typeof JOB;
  readonly issue: number;
  readonly branch: string;
  readonly agent: ShipperConfig['agent'];
  readonly model: string;
  readonly repoRoot: string;
  readonly promptPath: string;
  readonly logPath: string;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly status: 'running' | 'succeeded' | 'failed';
  readonly exitStatus?: number | null;
  readonly signal?: NodeJS.Signals | null;
  readonly error?: string;
}

interface CapacitySnapshot {
  readonly allowedAgents: number;
  readonly cpuCount: number;
  readonly freeMemoryMb: number;
  readonly loadAverage1m: number;
  readonly loadPerCpu: number;
  readonly reasons: ReadonlyArray<string>;
}

function shortError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function writeAgentAttemptState(
  statePath: string,
  state: AgentAttemptState
): void {
  try {
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  } catch (err) {
    logJobEvent({
      job: JOB,
      event: 'agent_attempt_state_write_failed',
      statePath,
      error: shortError(err),
    });
  }
}

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadHermesEnv(): void {
  if (!existsSync(HERMES_PATHS.env)) return;
  const lines = readFileSync(HERMES_PATHS.env, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    process.env[key] = unquoteEnvValue(trimmed.slice(index + 1));
  }
}

function run(args: ReadonlyArray<string>, config: ShipperConfig): string {
  try {
    const result = execFileSync(args[0], args.slice(1), {
      cwd: config.repoRoot,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 5 * 1024 * 1024,
    });
    spawnResourceGuard.recordSuccess();
    return result;
  } catch (err) {
    if (isSpawnResourceUnavailable(err)) {
      spawnResourceGuard.recordFailure(args[0], err);
      throw new SpawnResourceUnavailableError(args[0], err);
    }
    throw err;
  }
}

function systemCapacity(
  config: ShipperConfig,
  openCodexPrCount: number
): CapacitySnapshot {
  const cpuCount = Math.max(1, availableParallelism());
  const freeMemoryMb = Math.round(freemem() / 1024 / 1024);
  const loadAverage1m = loadavg()[0] ?? 0;
  const loadPerCpu = loadAverage1m / cpuCount;
  const reasons: string[] = [];

  // Cap simultaneous codex dispatches to keep CI predictable (JOV-4201).
  const MAX_CONCURRENT_DISPATCH_CAP = 5;
  const remainingPrCapacity = Math.max(
    0,
    MAX_CONCURRENT_DISPATCH_CAP - openCodexPrCount
  );

  let allowedAgents = Math.min(
    config.maxIssuesPerRun,
    config.maxParallelAgents,
    remainingPrCapacity
  );

  if (remainingPrCapacity === 0) {
    reasons.push(
      `reached max concurrent codex PR cap (${MAX_CONCURRENT_DISPATCH_CAP})`
    );
  }

  if (freeMemoryMb < config.minFreeMemoryMb) {
    allowedAgents = Math.min(allowedAgents, 1);
    reasons.push(
      `free memory ${freeMemoryMb}MB below ${config.minFreeMemoryMb}MB`
    );
  }

  if (loadPerCpu > config.maxLoadPerCpu) {
    allowedAgents = Math.min(allowedAgents, 1);
    reasons.push(
      `load ${loadPerCpu.toFixed(2)}/cpu above ${config.maxLoadPerCpu}`
    );
  }

  if (
    freeMemoryMb < config.minFreeMemoryMb / 2 ||
    loadPerCpu > config.maxLoadPerCpu * 1.5
  ) {
    allowedAgents = 0;
    reasons.push('system pressure too high to launch another coding agent');
  }

  return {
    allowedAgents,
    cpuCount,
    freeMemoryMb,
    loadAverage1m,
    loadPerCpu,
    reasons,
  };
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, 'z');
}

function branchExists(config: ShipperConfig, branchName: string): boolean {
  const local = spawnSyncSafe(
    'git',
    ['rev-parse', '--verify', `refs/heads/${branchName}`],
    config.repoRoot
  );
  if (local.status === 0) return true;

  const remote = spawnSyncSafe(
    'git',
    ['ls-remote', '--exit-code', '--heads', 'origin', branchName],
    config.repoRoot
  );
  return remote.status === 0;
}

function spawnSyncSafe(
  command: string,
  args: ReadonlyArray<string>,
  cwd: string
): { readonly status: number | null; readonly resourceUnavailable: boolean } {
  try {
    const result = execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      timeout: 30_000,
      stdio: 'ignore',
    });
    void result;
    spawnResourceGuard.recordSuccess();
    return { status: 0, resourceUnavailable: false };
  } catch (err) {
    if (isSpawnResourceUnavailable(err)) {
      spawnResourceGuard.recordFailure(command, err);
      return { status: null, resourceUnavailable: true };
    }
    const status =
      typeof (err as { status?: unknown }).status === 'number'
        ? ((err as { status: number }).status ?? 1)
        : 1;
    return { status, resourceUnavailable: false };
  }
}

function prepareWorktree(
  config: ShipperConfig,
  plan: DispatchPlan
): { readonly plan: DispatchPlan; readonly repoRoot: string } {
  const base = timestampSlug();
  const branchName = branchExists(config, plan.branchName)
    ? `${plan.branchName}-${base}`
    : plan.branchName;
  const root =
    process.env.HERMES_CODEX_SHIPPER_WORKTREE_ROOT ??
    join(tmpdir(), 'jovie-worktrees');
  const repoRoot = join(root, `gh-${plan.issue.number}-${base}`);

  mkdirSync(root, { recursive: true });
  run(['git', 'fetch', 'origin', 'main'], config);
  run(
    ['git', 'worktree', 'add', '-b', branchName, repoRoot, 'origin/main'],
    config
  );

  return {
    plan: { ...plan, branchName },
    repoRoot,
  };
}

function cleanupWorktree(config: ShipperConfig, repoRoot: string): void {
  try {
    run(['git', 'worktree', 'remove', '--force', repoRoot], config);
    return;
  } catch (err) {
    logJobEvent({
      job: JOB,
      event: 'worktree_remove_failed',
      repoRoot,
      error: shortError(err),
    });
  }

  try {
    rmSync(repoRoot, { recursive: true, force: true });
  } catch (err) {
    logJobEvent({
      job: JOB,
      event: 'worktree_cleanup_failed',
      repoRoot,
      error: shortError(err),
    });
  }
}

function detectRepoRoot(): string | null {
  if (process.env.HERMES_JOVIE_REPO) return process.env.HERMES_JOVIE_REPO;
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      timeout: 10_000,
    }).trim();
    spawnResourceGuard.recordSuccess();
    return root;
  } catch (err) {
    if (isSpawnResourceUnavailable(err)) {
      spawnResourceGuard.recordFailure('git', err);
      return null;
    }
    throw err;
  }
}

/**
 * Fail-closed primary-checkout gate (#12841). The shipper process already
 * loaded dispatcher code from repoRoot at startup; if that checkout is not
 * clean main at origin/main we refuse to dispatch THIS tick even after disk
 * recovery so the next launchd re-exec loads fresh code.
 */
async function gatePrimaryCheckout(repoRoot: string): Promise<boolean> {
  const git = (args: ReadonlyArray<string>): string =>
    execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 60_000,
    }).trim();

  let state: CheckoutState;
  let dirtyPaths: ReadonlyArray<string> = [];
  try {
    git(['fetch', 'origin', 'main']);
    const porcelain = git(['status', '--porcelain', '--untracked-files=no']);
    dirtyPaths = parseDirtyPaths(porcelain);
    state = {
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
      headSha: git(['rev-parse', 'HEAD']),
      originMainSha: git(['rev-parse', 'origin/main']),
      dirty: porcelain.length > 0,
    };
  } catch (err) {
    logJobEvent({
      job: JOB,
      event: 'stale_checkout_abort',
      detail: `checkout inspection failed: ${shortError(err)}`,
      recovered: false,
      dirtyPaths,
    });
    return true;
  }

  const plan = planCheckoutGate(state, dirtyPaths);
  if (plan.proceed) return true;

  let recovered = false;
  let recoveryError: string | undefined;
  if (plan.attemptRecovery) {
    try {
      if (state.dirty) {
        git(['stash', 'push', '-m', buildRecoveryStashMessage(plan.detail)]);
      }
      git(['checkout', 'main']);
      git(['reset', '--hard', 'origin/main']);
      recovered = true;
      logJobEvent({
        job: JOB,
        event: 'stale_checkout_recovered',
        detail: plan.detail,
        stashed: state.dirty,
        dirtyPaths,
      });
    } catch (err) {
      recoveryError = shortError(err);
      logJobEvent({
        job: JOB,
        event: 'stale_checkout_recovery_failed',
        detail: plan.detail,
        error: recoveryError,
        dirtyPaths,
      });
    }
  }

  const alertLines = [
    'Ovie shipper stale_checkout_abort',
    `repo: ${repoRoot}`,
    `detail: ${plan.detail}`,
    plan.recoveryBlockedReason
      ? `recovery skipped: ${plan.recoveryBlockedReason}`
      : null,
    recovered
      ? 'disk recovery: succeeded (this tick still aborts — next launchd re-exec loads fresh dispatcher code)'
      : recoveryError
        ? `disk recovery: failed (${recoveryError})`
        : plan.attemptRecovery
          ? 'disk recovery: not attempted'
          : null,
    dirtyPaths.length > 0 ? `dirty paths: ${dirtyPaths.join(', ')}` : null,
  ].filter((line): line is string => line !== null);

  logJobEvent({
    job: JOB,
    event: 'stale_checkout_abort',
    repoRoot,
    detail: plan.detail,
    recovered,
    recoveryError,
    recoveryBlockedReason: plan.recoveryBlockedReason,
    dirtyPaths,
  });
  await sendOpsAlert(alertLines.join('\n'));
  return false;
}

function detectGithubRepo(repoRoot: string): string | null {
  if (process.env.GH_REPO) return process.env.GH_REPO;
  try {
    const repo = execFileSync(
      'gh',
      ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 30_000,
      }
    ).trim();
    spawnResourceGuard.recordSuccess();
    return repo;
  } catch (err) {
    if (isSpawnResourceUnavailable(err)) {
      spawnResourceGuard.recordFailure('gh', err);
      return null;
    }
    throw err;
  }
}

interface ListCodexIssuesResult {
  readonly issues: ReadonlyArray<GithubIssue>;
  readonly resourceUnavailable: boolean;
}

function countOpenCodexPrs(config: ShipperConfig): number {
  try {
    const raw = run(
      [
        'gh',
        'pr',
        'list',
        '--repo',
        config.repo,
        '--state',
        'open',
        '--limit',
        '100',
        '--json',
        'headRefName',
        '--jq',
        '[.[] | select(.headRefName | startswith("codex/"))] | length',
      ],
      config
    );
    return Number.parseInt(raw.trim(), 10) || 0;
  } catch (err) {
    logJobEvent({
      job: JOB,
      event: 'count_open_prs_failed',
      error: shortError(err),
    });
    // Fail closed: if we can't count PRs, assume we're at capacity.
    return 100;
  }
}

function listCodexIssues(config: ShipperConfig): ListCodexIssuesResult {
  // gh CLI supports --limit up to 1000; honor the configured issueFetchLimit.
  // ponytail: was Math.min(100,...) — hard cap was ignoring plist FETCH_LIMIT=200 env var
  const fetchLimit = config.issueFetchLimit || 200;
  try {
    const raw = run(
      [
        'gh',
        'issue',
        'list',
        '--repo',
        config.repo,
        '--state',
        'open',
        '--limit',
        String(fetchLimit),
        '--json',
        'number,title,body,url,updatedAt,labels',
      ],
      config
    );
    const issues = JSON.parse(raw) as GithubIssue[];
    return {
      issues: issues.slice(0, config.issueFetchLimit || 100),
      resourceUnavailable: false,
    };
  } catch (err) {
    if (err instanceof SpawnResourceUnavailableError) {
      return { issues: [], resourceUnavailable: true };
    }
    throw err;
  }
}

async function handleSpawnResourcePressure(context: string): Promise<void> {
  await spawnResourceGuard.maybeBackoff();
  logJobEvent({
    job: JOB,
    event: 'spawn_resource_skip',
    context,
    consecutive: spawnResourceGuard.consecutiveFailures,
  });
}

function ensureLabel(
  config: ShipperConfig,
  name: string,
  color: string,
  description: string
): void {
  try {
    run(
      [
        'gh',
        'label',
        'create',
        name,
        '--repo',
        config.repo,
        '--color',
        color,
        '--description',
        description,
      ],
      config
    );
    return;
  } catch {
    // Existing labels return a non-zero exit. Edit best-effort so the
    // description stays useful, but do not block dispatch if this fails.
  }

  try {
    run(
      [
        'gh',
        'label',
        'edit',
        name,
        '--repo',
        config.repo,
        '--color',
        color,
        '--description',
        description,
      ],
      config
    );
  } catch (err) {
    logJobEvent({
      job: JOB,
      event: 'label_ensure_failed',
      label: name,
      error: shortError(err),
    });
  }
}

function ensureControlLabels(config: ShipperConfig): void {
  ensureLabel(
    config,
    CODEX_CLAIM_LABEL,
    '0969da',
    'Claimed by the local codex issue shipper'
  );
  ensureLabel(
    config,
    CODEX_BLOCKED_LABEL,
    'd1242f',
    'Codex issue shipper hit a real blocker and will not retry automatically'
  );
  ensureLabel(
    config,
    CODEX_TRUSTED_LABEL,
    '0e8a16',
    'Maintainer approval for the local codex issue shipper to run an agent'
  );
  ensureLabel(
    config,
    NO_AUTO_LABEL,
    'e99695',
    'Opt out of automated issue shipping — agent will skip this issue'
  );
}

function commentIssue(
  config: ShipperConfig,
  issueNumber: number,
  body: string
): void {
  run(
    [
      'gh',
      'issue',
      'comment',
      String(issueNumber),
      '--repo',
      config.repo,
      '--body',
      body,
    ],
    config
  );
}

function claimIssue(config: ShipperConfig, plan: DispatchPlan): boolean {
  // Re-read the issue immediately before claiming. The planner snapshot can be
  // stale while another shipper tick (or a human) claims the same issue.
  let current: { state?: string; labels?: ReadonlyArray<{ name: string }> };
  try {
    current = JSON.parse(
      run(
        [
          'gh',
          'issue',
          'view',
          String(plan.issue.number),
          '--repo',
          config.repo,
          '--json',
          'state,labels',
        ],
        config
      )
    ) as typeof current;
  } catch (err) {
    logJobEvent({
      job: JOB,
      event: 'claim_revalidation_failed',
      issue: plan.issue.number,
      error: shortError(err),
    });
    return false;
  }

  const currentIssue: GithubIssue = {
    ...plan.issue,
    labels: current.labels ?? [],
  };
  if (
    current.state?.toUpperCase() !== 'OPEN' ||
    isAlreadyClaimedOrBlocked(currentIssue)
  ) {
    logJobEvent({
      job: JOB,
      event: 'claim_deduped',
      issue: plan.issue.number,
      state: current.state,
      labels: labelNames(currentIssue),
    });
    return false;
  }

  run(
    [
      'gh',
      'issue',
      'edit',
      String(plan.issue.number),
      '--repo',
      config.repo,
      '--add-label',
      CODEX_CLAIM_LABEL,
    ],
    config
  );

  // Confirm the shared claim signal landed before starting an agent. This
  // avoids a false local claim when GitHub accepted neither the edit nor the
  // token's permission to mutate labels.
  const confirmed = JSON.parse(
    run(
      [
        'gh',
        'issue',
        'view',
        String(plan.issue.number),
        '--repo',
        config.repo,
        '--json',
        'state,labels',
      ],
      config
    )
  ) as typeof current;
  const confirmedIssue: GithubIssue = {
    ...plan.issue,
    labels: confirmed.labels ?? [],
  };
  if (
    confirmed.state?.toUpperCase() !== 'OPEN' ||
    !labelNames(confirmedIssue).includes(CODEX_CLAIM_LABEL)
  ) {
    logJobEvent({
      job: JOB,
      event: 'claim_confirmation_failed',
      issue: plan.issue.number,
      state: confirmed.state,
      labels: labelNames(confirmedIssue),
    });
    return false;
  }

  commentIssue(
    config,
    plan.issue.number,
    [
      `Jovie agent (codex issue shipper) claimed this issue.`,
      '',
      `Branch: ${plan.branchName}`,
      `Risk: ${plan.route.riskLevel}`,
      `Model route: ${plan.route.modelProfile} using ${plan.route.sessionModel}`,
      plan.integrationBranch
        ? `Integration branch: ${plan.integrationBranch}`
        : 'Integration branch: not used for this issue',
    ].join('\n')
  );
  return true;
}

function markBlocked(
  config: ShipperConfig,
  plan: DispatchPlan,
  reason: string
): void {
  removeClaimLabel(config, plan, 'mark_blocked_claim_remove_failed');

  try {
    run(
      [
        'gh',
        'issue',
        'edit',
        String(plan.issue.number),
        '--repo',
        config.repo,
        '--add-label',
        CODEX_BLOCKED_LABEL,
      ],
      config
    );
  } catch (err) {
    logJobEvent({
      job: JOB,
      event: 'mark_blocked_label_failed',
      issue: plan.issue.number,
      error: shortError(err),
    });
  }

  try {
    commentIssue(
      config,
      plan.issue.number,
      [
        `Jovie agent (codex issue shipper) stopped on a real blocker.`,
        '',
        reason,
      ].join('\n')
    );
  } catch (err) {
    logJobEvent({
      job: JOB,
      event: 'mark_blocked_comment_failed',
      issue: plan.issue.number,
      error: shortError(err),
    });
  }
}

function removeClaimLabel(
  config: ShipperConfig,
  plan: DispatchPlan,
  event: string
): void {
  try {
    run(
      [
        'gh',
        'issue',
        'edit',
        String(plan.issue.number),
        '--repo',
        config.repo,
        '--remove-label',
        CODEX_CLAIM_LABEL,
      ],
      config
    );
  } catch (err) {
    logJobEvent({
      job: JOB,
      event,
      issue: plan.issue.number,
      error: shortError(err),
    });
  }
}

function releaseClaimForRetry(
  config: ShipperConfig,
  plan: DispatchPlan,
  reason: string
): void {
  removeClaimLabel(config, plan, 'release_claim_label_failed');

  try {
    commentIssue(
      config,
      plan.issue.number,
      // Header is the exported constant the retry counter matches on — keep
      // this the ONLY place it is emitted so emitter and counter can't drift.
      [RETRY_RELEASE_COMMENT_HEADER, '', reason].join('\n')
    );
  } catch (err) {
    logJobEvent({
      job: JOB,
      event: 'release_claim_comment_failed',
      issue: plan.issue.number,
      error: shortError(err),
    });
  }
}

function fetchIssueComments(
  config: ShipperConfig,
  issueNumber: number
): IssueComment[] {
  try {
    const raw = run(
      [
        'gh',
        'issue',
        'view',
        String(issueNumber),
        '--repo',
        config.repo,
        '--json',
        'comments',
      ],
      config
    );
    const parsed = JSON.parse(raw) as {
      comments?: ReadonlyArray<{
        body?: string | null;
        viewerDidAuthor?: boolean | null;
      }>;
    };
    return (parsed.comments ?? []).map(comment => ({
      body: comment.body ?? '',
      viewerDidAuthor: comment.viewerDidAuthor === true,
    }));
  } catch (err) {
    // Fail open: a gh hiccup must not escalate a task that isn't actually
    // stuck. An empty list means priorReleases=0, so we release as before.
    logJobEvent({
      job: JOB,
      event: 'retry_comments_fetch_failed',
      issue: issueNumber,
      error: shortError(err),
    });
    return [];
  }
}

/**
 * Retry-escalation gate (#13126). Count how many times this issue was already
 * released for retry; after MAX_RETRY_RELEASES failures, mark it blocked with a
 * diagnostic (which drops it from the dispatchable pool) instead of releasing
 * into another agent run.
 */
function releaseOrEscalate(
  config: ShipperConfig,
  plan: DispatchPlan,
  reason: string
): void {
  const priorReleases = countRetryReleases(
    fetchIssueComments(config, plan.issue.number)
  );
  if (shouldEscalateRetry(priorReleases)) {
    markBlocked(
      config,
      plan,
      buildRetryEscalationReason(priorReleases, reason)
    );
    logJobEvent({
      job: JOB,
      event: 'retry_escalated_blocked',
      issue: plan.issue.number,
      priorReleases,
    });
    return;
  }
  releaseClaimForRetry(config, plan, reason);
}

function gbrainCaptureSlug(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  try {
    const parsed = JSON.parse(trimmed) as { slug?: string };
    return parsed.slug ?? fallback;
  } catch {
    return trimmed.split('\n').at(-1)?.trim() || fallback;
  }
}

function collectGbrainContext(plan: DispatchPlan): GbrainContext {
  const bin = process.env.HERMES_GBRAIN_BIN ?? 'gbrain';
  const queryText = buildGbrainQuery(plan.issue);
  let queryResult = '';

  try {
    queryResult = execFileSync(
      bin,
      [
        'query',
        queryText,
        '--limit',
        '5',
        '--adaptive-return',
        '--detail',
        'medium',
      ],
      {
        encoding: 'utf8',
        timeout: 45_000,
        maxBuffer: 512 * 1024,
      }
    );
  } catch (err) {
    queryResult = `gbrain query failed: ${shortError(err)}`;
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace(/Z$/, 'z');
  const slug = `ops/codex-issue-shipper/github-${plan.issue.number}-${timestamp}`;
  const captureText = buildGbrainCaptureText(plan.issue);
  let captureSlug: string;
  try {
    const captureOut = execFileSync(
      bin,
      ['capture', '--stdin', '--type', 'report', '--slug', slug, '--json'],
      {
        encoding: 'utf8',
        input: captureText,
        timeout: 30_000,
        maxBuffer: 256 * 1024,
      }
    );
    captureSlug = gbrainCaptureSlug(captureOut, slug);
  } catch (err) {
    const captureError = `gbrain capture failed: ${shortError(err)}`;
    queryResult = [queryResult.trim(), captureError]
      .filter(Boolean)
      .join('\n\n');
    captureSlug = `${slug} (capture failed)`;
  }

  return {
    captureSlug,
    queryText,
    queryResult,
  };
}

function agentLogsDir(): string {
  const dir = join(HERMES_PATHS.logsDir, JOB);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function runAgent(
  config: ShipperConfig,
  plan: DispatchPlan,
  prompt: string,
  repoRoot: string
): Promise<AgentRunResult> {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace(/Z$/, 'z');
  const dir = agentLogsDir();
  const base = `github-${plan.issue.number}-${timestamp}`;
  const logPath = join(dir, `${base}.log`);
  const promptPath = join(dir, `${base}.prompt.md`);
  const statePath = join(dir, `${base}.state.json`);
  writeFileSync(promptPath, prompt);
  const startedAt = new Date().toISOString();
  writeAgentAttemptState(statePath, {
    job: JOB,
    issue: plan.issue.number,
    branch: plan.branchName,
    agent: config.agent,
    model: plan.route.sessionModel,
    repoRoot,
    promptPath,
    logPath,
    startedAt,
    updatedAt: startedAt,
    status: 'running',
  });
  appendFileSync(
    logPath,
    [
      `job=${JOB}`,
      `issue=${plan.issue.number}`,
      `branch=${plan.branchName}`,
      `model=${plan.route.sessionModel}`,
      `started=${startedAt}`,
      `state=${statePath}`,
      '',
    ].join('\n')
  );

  const agentConfig = { ...config, repoRoot };
  const command = buildAgentCommand(agentConfig, plan.route, promptPath);
  const fd = openSync(logPath, 'a');
  return new Promise(resolve => {
    let settled = false;
    let timedOut = false;
    let timeout: NodeJS.Timeout;
    const child = spawn(command.command, [...command.args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        JOVIE_AGENT_PROFILE: 'coder',
      },
      stdio: ['pipe', fd, fd],
    });

    const finish = (
      result: Omit<AgentRunResult, 'logPath' | 'promptPath' | 'statePath'>
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      closeSync(fd);
      writeAgentAttemptState(statePath, {
        job: JOB,
        issue: plan.issue.number,
        branch: plan.branchName,
        agent: config.agent,
        model: plan.route.sessionModel,
        repoRoot,
        promptPath,
        logPath,
        startedAt,
        updatedAt: new Date().toISOString(),
        status: result.ok ? 'succeeded' : 'failed',
        exitStatus: result.status,
        signal: result.signal,
        error: result.error,
      });
      resolve({ ...result, logPath, promptPath, statePath });
    };

    timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, config.agentTimeoutMs);

    child.on('error', err => {
      finish({
        ok: false,
        status: null,
        signal: null,
        error: shortError(err),
      });
    });

    child.on('close', (status, signal) => {
      finish({
        ok: status === 0,
        status,
        signal,
        error: timedOut
          ? `Agent timeout after ${config.agentTimeoutMs}ms`
          : undefined,
      });
    });

    child.stdin.end(config.agent === 'grok' ? undefined : prompt);
  });
}

function findPrForBranch(
  config: ShipperConfig,
  branchName: string
): { number: number; url: string } | null {
  try {
    const raw = run(
      [
        'gh',
        'pr',
        'list',
        '--repo',
        config.repo,
        '--head',
        branchName,
        '--state',
        'open',
        '--json',
        'number,url',
      ],
      config
    );
    const prs = JSON.parse(raw) as ReadonlyArray<{
      number: number;
      url: string;
    }>;
    return prs[0] ?? null;
  } catch {
    return null;
  }
}

async function dispatchPlan(
  config: ShipperConfig,
  plan: DispatchPlan
): Promise<void> {
  const gbrain = collectGbrainContext(plan);
  const gbrainBlocker = gbrainContextBlocker(gbrain);
  if (gbrainBlocker) {
    markBlocked(config, plan, gbrainBlocker);
    logJobEvent({
      job: JOB,
      event: 'gbrain_coordination_blocked',
      issue: plan.issue.number,
      error: gbrainBlocker,
    });
    return;
  }

  const prepared = prepareWorktree(config, plan);
  const dispatch = prepared.plan;
  try {
    if (!claimIssue(config, dispatch)) {
      // Another active shipper/human won the race, or GitHub did not confirm
      // our label mutation. Do not mark the issue blocked or release a claim
      // we do not own; the next tick will re-evaluate it.
      return;
    }
    journalStart({
      job: JOB,
      repo: config.repo,
      issue: dispatch.issue.number,
      branch: dispatch.branchName,
      worktree: prepared.repoRoot,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    });

    const runInWorktree: FinisherRunner = (args, opts) =>
      execFileSync(args[0], args.slice(1), {
        cwd: prepared.repoRoot,
        encoding: 'utf8',
        timeout: opts?.timeoutMs ?? 30_000,
        maxBuffer: 5 * 1024 * 1024,
      });
    const safeHasWork = (): boolean => {
      try {
        return worktreeHasWork(runInWorktree);
      } catch {
        return false;
      }
    };

    // Agent fallback chain: an attempt that ends with neither a PR nor work
    // in the worktree (and wasn't killed by the system) hands the same
    // dispatch to the next harness instead of burning a claim-release cycle.
    const chain = parseAgentChain(process.env, config.agent);
    let agentResult!: AgentRunResult;
    let pr: { number: number; url: string } | null = null;
    let isSystemKilled = false;

    for (let attempt = 0; attempt < chain.length; attempt++) {
      const agent = chain[attempt];
      const attemptRoute = routeForAgent(agent, dispatch.route);
      const attemptConfig = { ...config, agent };
      const attemptDispatch = { ...dispatch, route: attemptRoute };
      const prompt = buildAgentPrompt({
        issue: attemptDispatch.issue,
        branchName: attemptDispatch.branchName,
        baseBranch: 'main',
        integrationBranch: attemptDispatch.integrationBranch,
        route: attemptRoute,
        gbrain,
        repoRoot: prepared.repoRoot,
      });

      agentResult = await runAgent(
        attemptConfig,
        attemptDispatch,
        prompt,
        prepared.repoRoot
      );
      logJobEvent({
        job: JOB,
        event: agentResult.ok ? 'agent_succeeded' : 'agent_failed',
        issue: dispatch.issue.number,
        agent,
        attempt: attempt + 1,
        status: agentResult.status,
        signal: agentResult.signal,
        error: agentResult.error,
        logPath: agentResult.logPath,
        promptPath: agentResult.promptPath,
        statePath: agentResult.statePath,
        gbrainSlug: gbrain.captureSlug,
      });

      // SIGTERM or timeout = system interruption — do not chain, release.
      // A null exit status means the agent never ran to a decision — a
      // spawn/infra failure (e.g. a harness binary missing), not a code
      // verdict. Treat it like a system interruption: release, don't block.
      isSystemKilled =
        agentResult.status === 143 ||
        agentResult.status === 137 ||
        agentResult.status === null ||
        Boolean(agentResult.error?.includes('timeout')) ||
        Boolean(agentResult.error?.includes('killed'));
      if (isSystemKilled) break;

      pr = findPrForBranch(config, dispatch.branchName);
      if (pr || safeHasWork()) break;

      if (attempt < chain.length - 1) {
        logJobEvent({
          job: JOB,
          event: 'agent_no_work_fallback',
          issue: dispatch.issue.number,
          fromAgent: agent,
          toAgent: chain[attempt + 1],
        });
      }
    }

    if (isSystemKilled) {
      releaseOrEscalate(
        config,
        dispatch,
        [
          `Agent was interrupted (status=${agentResult.status}) - releasing claim for retry.`,
          '',
          agentResult.error ? `Error: \`${agentResult.error}\`` : null,
          `Log: \`${agentResult.logPath}\``,
          `State: \`${agentResult.statePath}\``,
        ]
          .filter((line): line is string => line !== null)
          .join('\n')
      );
      logJobEvent({
        job: JOB,
        event: 'agent_interrupted_release_claim',
        issue: dispatch.issue.number,
        status: agentResult.status,
        error: agentResult.error,
      });
      return;
    }

    // Non-zero exit (but not killed) = genuine failure, mark blocked
    if (!agentResult.ok) {
      markBlocked(
        config,
        dispatch,
        [
          `Agent exited without successfully shipping.`,
          '',
          `Status: \`${agentResult.status ?? 'null'}\``,
          `Signal: \`${agentResult.signal ?? 'null'}\``,
          agentResult.error ? `Error: \`${agentResult.error}\`` : null,
          `Log: \`${agentResult.logPath}\``,
          `Prompt: \`${agentResult.promptPath}\``,
          `State: \`${agentResult.statePath}\``,
        ]
          .filter((line): line is string => line !== null)
          .join('\n')
      );
      return;
    }

    if (!pr) pr = findPrForBranch(config, dispatch.branchName);

    // Deterministic finisher: the agent exited 0 without opening a PR, but
    // may have left real work in the worktree (grok 0.2.77 abandons the
    // long ship contract mid-task). Same trust model as the kanban lane —
    // the model produces the diff, deterministic code owns commit/push/PR.
    // Pre-commit hooks gate the commit; any failure falls through to the
    // existing release-for-retry path.
    if (!pr) {
      try {
        if (worktreeHasWork(runInWorktree)) {
          finishDispatch(runInWorktree, {
            repo: config.repo,
            branchName: dispatch.branchName,
            issue: dispatch.issue,
            logPath: agentResult.logPath,
            statePath: agentResult.statePath,
          });
          pr = findPrForBranch(config, dispatch.branchName);
          logJobEvent({
            job: JOB,
            event: 'deterministic_finish_shipped',
            issue: dispatch.issue.number,
            branch: dispatch.branchName,
            pr: pr?.number,
          });
        }
      } catch (err) {
        logJobEvent({
          job: JOB,
          event: 'deterministic_finish_failed',
          issue: dispatch.issue.number,
          branch: dispatch.branchName,
          error: shortError(err),
        });
      }
    }

    if (!pr) {
      releaseOrEscalate(
        config,
        dispatch,
        [
          `Agent exited 0 but no open PR exists - releasing claim for retry.`,
          '',
          `Log: \`${agentResult.logPath}\``,
          `Prompt: \`${agentResult.promptPath}\``,
          `State: \`${agentResult.statePath}\``,
        ].join('\n')
      );
      logJobEvent({
        job: JOB,
        event: 'missing_pr_release_claim',
        issue: plan.issue.number,
        branch: dispatch.branchName,
      });
      return;
    }

    let successCommentPosted = true;
    try {
      commentIssue(
        config,
        dispatch.issue.number,
        [
          `Jovie agent completed this issue and opened PR #${pr.number}.`,
          '',
          `PR: ${pr.url}`,
          `GBrain dispatch slug: \`${gbrain.captureSlug}\``,
          `Log: \`${agentResult.logPath}\``,
          `State: \`${agentResult.statePath}\``,
        ].join('\n')
      );
    } catch (err) {
      successCommentPosted = false;
      logJobEvent({
        job: JOB,
        event: 'success_comment_failed',
        issue: plan.issue.number,
        pr: pr.number,
        error: shortError(err),
      });
    }

    removeClaimLabel(config, dispatch, 'success_claim_remove_failed');

    logJobEvent({
      job: JOB,
      event: 'pr_found_after_success',
      issue: dispatch.issue.number,
      pr: pr.number,
      url: pr.url,
      successCommentPosted,
    });
  } finally {
    // Terminal for every path (success, blocked, released, thrown): the
    // dispatch is no longer in flight, so a restart must not "recover" it.
    journalEnd(dispatch.issue.number, config.repo);
    cleanupWorktree(config, prepared.repoRoot);
  }
}

/**
 * Restart recovery: release claims journaled by a previous shipper process
 * that died mid-dispatch (auto-update, crash, kickstart -k). The issue goes
 * back to the dispatchable pool; the worktree is pruned. Runs once per
 * process, under the ship-owner lock, before any new dispatch.
 */
function recoverStaleJobs(config: ShipperConfig): void {
  const { stale, live } = planRecovery(readJournal());
  for (const entry of stale) {
    try {
      run(
        [
          'gh',
          'issue',
          'edit',
          String(entry.issue),
          '--repo',
          entry.repo,
          '--remove-label',
          CODEX_CLAIM_LABEL,
        ],
        config
      );
    } catch {
      // Label already gone (or gh hiccup) — recovery stays best-effort.
    }
    try {
      commentIssue(
        config,
        entry.issue,
        `Jovie agent (codex issue shipper) restarted mid-dispatch (owner pid ${entry.pid} gone). Claim released for retry.`
      );
    } catch {
      // Comment is informational only.
    }
    if (entry.worktree && existsSync(entry.worktree)) {
      cleanupWorktree(config, entry.worktree);
    }
    journalEnd(entry.issue, entry.repo);
    logJobEvent({
      job: JOB,
      event: 'restart_recovered_claim',
      issue: entry.issue,
      repo: entry.repo,
      deadPid: entry.pid,
      startedAt: entry.startedAt,
    });
  }
  if (stale.length > 0 || live.length > 0) {
    logJobEvent({
      job: JOB,
      event: 'restart_recovery_done',
      recovered: stale.length,
      stillLive: live.length,
    });
  }
}

async function dispatchBatch(
  config: ShipperConfig,
  plans: ReadonlyArray<DispatchPlan>
): Promise<void> {
  await Promise.all(
    plans.map(async plan => {
      try {
        await dispatchPlan(config, plan);
      } catch (err) {
        logJobEvent({
          job: JOB,
          event: 'dispatch_failed',
          issue: plan.issue.number,
          error: shortError(err),
        });
        markBlocked(
          config,
          plan,
          `Dispatcher failed before a clean agent handoff.\n\n\`\`\`text\n${shortError(err)}\n\`\`\``
        );
      }
    })
  );
}

async function main(): Promise<void> {
  try {
    await runShipper();
    ghEagainBackoff.reset();
  } catch (err) {
    if (err instanceof SpawnEagainError) {
      await handleSpawnEagain(err, 'shipper');
      return;
    }
    throw err;
  }
}

async function runShipper(): Promise<void> {
  loadHermesEnv();

  // Pause sentinel: if the operator has touched ~/.hermes/shipping-paused,
  // skip this run entirely. Cheap — no GitHub scan, no gbrain, no model call.
  if (existsSync(PAUSE_SENTINEL)) {
    logJobEvent({ job: JOB, event: 'paused_skip' });
    return;
  }

  const repoRoot = detectRepoRoot();
  if (!repoRoot) {
    await handleSpawnResourcePressure('detect_repo_root');
    return;
  }
  // #12841: fail-closed when the primary checkout is not clean main at
  // origin/main. Skipped in dry-run so dev/CI feature-branch worktrees are not
  // reset or blocked.
  if (
    process.env.HERMES_CODEX_SHIPPER_DRY_RUN !== '1' &&
    !(await gatePrimaryCheckout(repoRoot))
  ) {
    return;
  }
  const repo = detectGithubRepo(repoRoot);
  if (!repo) {
    await handleSpawnResourcePressure('detect_github_repo');
    return;
  }
  const config = loadShipperConfig(process.env, repoRoot, repo);

  await withJobLogging(JOB, async () => {
    const lockResult = await tryWithHeavyJobLock(
      JOB,
      async () => {
        recoverStaleJobs(config);
        let controlLabelsEnsured = false;

        for (;;) {
          const openCodexPrCount = countOpenCodexPrs(config);
          const listed = listCodexIssues(config);
          if (listed.resourceUnavailable) {
            await handleSpawnResourcePressure('list_codex_issues');
            return;
          }
          const issues = listed.issues;
          const plans = buildDispatchPlans(issues, config);
          const skippedHuman = issues.filter(issue =>
            labelNames(issue).includes(HUMAN_REVIEW_LABEL)
          ).length;
          const skippedNoAuto = issues.filter(issue =>
            labelNames(issue).includes(NO_AUTO_LABEL)
          ).length;
          const skippedEpic = issues.filter(issue =>
            labelNames(issue).includes(EPIC_LABEL)
          ).length;
          const capacity = systemCapacity(config, openCodexPrCount);
          const batch = plans.slice(0, capacity.allowedAgents);

          logJobEvent({
            job: JOB,
            event: 'scanned',
            issueCount: issues.length,
            dispatchableCount: plans.length,
            skippedHuman,
            skippedNoAuto,
            skippedEpic,
            batchCount: batch.length,
            openCodexPrCount,
            maxIssuesPerRun: config.maxIssuesPerRun,
            maxParallelAgents: config.maxParallelAgents,
            capacity,
            dryRun: config.dryRun,
          });

          if (plans.length === 0) {
            logJobEvent({ job: JOB, event: 'empty_queue' });
            return;
          }

          if (batch.length === 0) {
            logJobEvent({
              job: JOB,
              event: 'capacity_throttled',
              capacity,
            });
            return;
          }

          if (config.dryRun) {
            logJobEvent({
              job: JOB,
              event: 'dry_run_planned',
              plans: batch.map(plan => ({
                issue: plan.issue.number,
                branch: plan.branchName,
                risk: plan.route.riskLevel,
                model: plan.route.sessionModel,
                integrationBranch: plan.integrationBranch,
              })),
            });
            return;
          }

          if (!controlLabelsEnsured) {
            ensureControlLabels(config);
            controlLabelsEnsured = true;
          }

          await dispatchBatch(config, batch);
        }
      },
      // Machine-global lock: profile-scoped HERMES_HOME must not yield two
      // "singletons" racing one GitHub queue (JovieInc/Jovie#12723).
      { staleMs: config.singletonLockStaleMs, lockPath: SHIP_OWNER_LOCK }
    );

    if (!lockResult.acquired) {
      logJobEvent({
        job: JOB,
        event: 'singleton_active_skip',
        owner: lockResult.owner,
      });
      return;
    }
  });
}

void main().catch(err => {
  if (err instanceof SpawnResourceUnavailableError) {
    logJobEvent({
      job: JOB,
      event: 'spawn_resource_skip',
      context: 'main_uncaught',
      command: err.command,
      error: err.message,
    });
    return;
  }
  logJobEvent({
    job: JOB,
    event: 'fatal',
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  console.error(`[${JOB}] fatal:`, err);
  process.exit(1);
});
