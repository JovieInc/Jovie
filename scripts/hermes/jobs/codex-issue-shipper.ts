#!/usr/bin/env tsx
/**
 * Codex Issue Shipper — Hermes-Air
 *
 * Watches open GitHub issues labeled `codex` and `codex-approved`, claims one
 * eligible issue, writes dispatch context to gbrain, then starts a
 * coder-profile agent to ship it.
 *
 * The empty-queue path is intentionally cheap: GitHub scan, log, exit. No
 * gbrain query, model call, subagent, or CodeRabbit work happens unless an
 * issue is eligible and claimed.
 */

import { execFileSync, spawn, spawnSync } from 'node:child_process';
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
  CODEX_BLOCKED_LABEL,
  CODEX_CLAIM_LABEL,
  CODEX_TRUSTED_LABEL,
  type DispatchPlan,
  type GbrainContext,
  type GithubIssue,
  HUMAN_REVIEW_LABEL,
  labelNames,
  loadShipperConfig,
  type ShipperConfig,
} from '../lib/codex-issue-shipper';
import { tryWithHeavyJobLock } from '../lib/heavy-job-lock';
import { HERMES_PATHS } from '../lib/hermes-paths';
import { logJobEvent, withJobLogging } from '../lib/jobs-log';

const JOB = 'codex-issue-shipper';

interface AgentRunResult {
  readonly ok: boolean;
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly error?: string;
  readonly logPath: string;
  readonly promptPath: string;
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
  return execFileSync(args[0], args.slice(1), {
    cwd: config.repoRoot,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 5 * 1024 * 1024,
  });
}

function systemCapacity(config: ShipperConfig): CapacitySnapshot {
  const cpuCount = Math.max(1, availableParallelism());
  const freeMemoryMb = Math.round(freemem() / 1024 / 1024);
  const loadAverage1m = loadavg()[0] ?? 0;
  const loadPerCpu = loadAverage1m / cpuCount;
  const reasons: string[] = [];
  let allowedAgents = Math.min(
    config.maxIssuesPerRun,
    config.maxParallelAgents
  );

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
): { readonly status: number | null } {
  try {
    const result = execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      timeout: 30_000,
      stdio: 'ignore',
    });
    void result;
    return { status: 0 };
  } catch (err) {
    const status =
      typeof (err as { status?: unknown }).status === 'number'
        ? ((err as { status: number }).status ?? 1)
        : 1;
    return { status };
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

function detectRepoRoot(): string {
  if (process.env.HERMES_JOVIE_REPO) return process.env.HERMES_JOVIE_REPO;
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    timeout: 10_000,
  }).trim();
}

function detectGithubRepo(repoRoot: string): string {
  if (process.env.GH_REPO) return process.env.GH_REPO;
  return execFileSync(
    'gh',
    ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 30_000,
    }
  ).trim();
}

function listCodexIssues(config: ShipperConfig): ReadonlyArray<GithubIssue> {
  const raw = run(
    [
      'gh',
      'issue',
      'list',
      '--repo',
      config.repo,
      '--state',
      'open',
      '--label',
      'codex',
      '--limit',
      String(config.issueFetchLimit),
      '--json',
      'number,title,body,url,updatedAt,labels',
    ],
    config
  );
  return JSON.parse(raw) as ReadonlyArray<GithubIssue>;
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

function issueHasCommentContaining(
  config: ShipperConfig,
  issueNumber: number,
  needle: string
): boolean {
  try {
    const raw = run(
      [
        'gh',
        'api',
        `repos/${config.repo}/issues/${issueNumber}/comments`,
        '--paginate',
        '--slurp',
      ],
      config
    );
    const pages = JSON.parse(raw) as ReadonlyArray<
      ReadonlyArray<{ body?: string }>
    >;
    const comments = pages.flat();
    return comments.some(comment => comment.body?.includes(needle));
  } catch {
    return false;
  }
}

function dispatchOverlapReason(
  config: ShipperConfig,
  plan: DispatchPlan
): string | null {
  const candidatePath = join(
    tmpdir(),
    `jovie-dispatch-candidate-${plan.issue.number}-${Date.now()}.json`
  );
  writeFileSync(
    candidatePath,
    `${JSON.stringify({
      id: String(plan.issue.number),
      title: plan.issue.title,
      description: plan.issue.body ?? '',
    })}\n`
  );

  try {
    const result = spawnSync(
      'node',
      [
        'scripts/merge-queue-guard.mjs',
        'dispatch-conflicts',
        '--candidate-json',
        candidatePath,
        '--json',
      ],
      {
        cwd: config.repoRoot,
        encoding: 'utf8',
        timeout: 60_000,
        env: {
          ...process.env,
          GH_REPO: config.repo,
        },
      }
    );

    if (result.status === 0) return null;
    if (result.status !== 2) {
      throw new Error((result.stderr || result.stdout).trim());
    }

    const parsed = JSON.parse(result.stdout) as {
      blockers?: ReadonlyArray<{
        number: number;
        headRefName: string;
        reason: string;
      }>;
    };
    const blockers = parsed.blockers ?? [];
    return blockers
      .slice(0, 5)
      .map(
        blocker =>
          `blocked by PR #${blocker.number} (${blocker.headRefName}): ${blocker.reason}`
      )
      .join('\n');
  } finally {
    rmSync(candidatePath, { force: true });
  }
}

function claimIssue(config: ShipperConfig, plan: DispatchPlan): void {
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

  commentIssue(
    config,
    plan.issue.number,
    [
      `Jovie agent (codex issue shipper) claimed this issue.`,
      '',
      `Branch: \`${plan.branchName}\``,
      `Risk: \`${plan.route.riskLevel}\``,
      `Model route: \`${plan.route.modelProfile}\` using \`${plan.route.sessionModel}\``,
      plan.integrationBranch
        ? `Integration branch: \`${plan.integrationBranch}\``
        : 'Integration branch: not used for this issue',
    ].join('\n')
  );
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
      [
        `Jovie agent (codex issue shipper) released this issue for retry.`,
        '',
        reason,
      ].join('\n')
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
  writeFileSync(promptPath, prompt);
  appendFileSync(
    logPath,
    [
      `job=${JOB}`,
      `issue=${plan.issue.number}`,
      `branch=${plan.branchName}`,
      `model=${plan.route.sessionModel}`,
      `started=${new Date().toISOString()}`,
      '',
    ].join('\n')
  );

  const agentConfig = { ...config, repoRoot };
  const command = buildAgentCommand(agentConfig, plan.route);
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
      result: Omit<AgentRunResult, 'logPath' | 'promptPath'>
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      closeSync(fd);
      resolve({ ...result, logPath, promptPath });
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

    child.stdin.end(prompt);
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
  const prepared = prepareWorktree(config, plan);
  const dispatch = prepared.plan;
  try {
    claimIssue(config, dispatch);

    let gbrain: GbrainContext;
    try {
      gbrain = collectGbrainContext(dispatch);
    } catch (err) {
      const reason = `GBrain capture failed, so no coding agent was started.\n\n\`\`\`text\n${shortError(err)}\n\`\`\``;
      releaseClaimForRetry(config, dispatch, reason);
      logJobEvent({
        job: JOB,
        event: 'gbrain_failed',
        issue: dispatch.issue.number,
        error: shortError(err),
      });
      return;
    }

    const prompt = buildAgentPrompt({
      issue: dispatch.issue,
      branchName: dispatch.branchName,
      baseBranch: 'main',
      integrationBranch: dispatch.integrationBranch,
      route: dispatch.route,
      gbrain,
      repoRoot: prepared.repoRoot,
    });

    const agentResult = await runAgent(
      config,
      dispatch,
      prompt,
      prepared.repoRoot
    );
    logJobEvent({
      job: JOB,
      event: agentResult.ok ? 'agent_succeeded' : 'agent_failed',
      issue: dispatch.issue.number,
      status: agentResult.status,
      signal: agentResult.signal,
      error: agentResult.error,
      logPath: agentResult.logPath,
      promptPath: agentResult.promptPath,
      gbrainSlug: gbrain.captureSlug,
    });

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
        ]
          .filter((line): line is string => line !== null)
          .join('\n')
      );
      return;
    }

    const pr = findPrForBranch(config, dispatch.branchName);
    if (!pr) {
      markBlocked(
        config,
        dispatch,
        [
          `Agent exited 0 but no open PR exists for \`${dispatch.branchName}\`.`,
          '',
          `Log: \`${agentResult.logPath}\``,
          `Prompt: \`${agentResult.promptPath}\``,
        ].join('\n')
      );
      logJobEvent({
        job: JOB,
        event: 'missing_pr_after_success',
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
    cleanupWorktree(config, prepared.repoRoot);
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

function filterPlansBlockedByOpenPrs(
  config: ShipperConfig,
  plans: ReadonlyArray<DispatchPlan>
): ReadonlyArray<DispatchPlan> {
  const unblocked: DispatchPlan[] = [];

  for (const plan of plans) {
    let reason: string | null;
    try {
      reason = dispatchOverlapReason(config, plan);
    } catch (err) {
      reason = `dispatch overlap check failed closed: ${shortError(err)}`;
    }

    if (!reason) {
      unblocked.push(plan);
      continue;
    }

    logJobEvent({
      job: JOB,
      event: 'dispatch_blocked_by_pr',
      issue: plan.issue.number,
      reason,
    });

    const marker = `codex issue shipper blocked-by-pr ${plan.issue.number}`;
    if (!issueHasCommentContaining(config, plan.issue.number, marker)) {
      try {
        commentIssue(
          config,
          plan.issue.number,
          [
            `Jovie agent (codex issue shipper) did not dispatch this issue because it overlaps in-flight autonomous work.`,
            '',
            reason,
            '',
            `Marker: ${marker}`,
          ].join('\n')
        );
      } catch (err) {
        logJobEvent({
          job: JOB,
          event: 'dispatch_blocked_comment_failed',
          issue: plan.issue.number,
          error: shortError(err),
        });
      }
    }
  }

  return unblocked;
}

async function main(): Promise<void> {
  loadHermesEnv();
  const repoRoot = detectRepoRoot();
  const repo = detectGithubRepo(repoRoot);
  const config = loadShipperConfig(process.env, repoRoot, repo);

  await withJobLogging(JOB, async () => {
    const lockResult = await tryWithHeavyJobLock(
      JOB,
      async () => {
        let controlLabelsEnsured = false;

        for (;;) {
          const issues = listCodexIssues(config);
          const plans = buildDispatchPlans(issues, config);
          const skippedHuman = issues.filter(issue =>
            labelNames(issue).includes(HUMAN_REVIEW_LABEL)
          ).length;
          const capacity = systemCapacity(config);
          const batch = filterPlansBlockedByOpenPrs(
            config,
            plans.slice(0, capacity.allowedAgents)
          );

          logJobEvent({
            job: JOB,
            event: 'scanned',
            issueCount: issues.length,
            dispatchableCount: plans.length,
            skippedHuman,
            batchCount: batch.length,
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
      { staleMs: config.singletonLockStaleMs }
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
  logJobEvent({
    job: JOB,
    event: 'fatal',
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  console.error(`[${JOB}] fatal:`, err);
  process.exit(1);
});
