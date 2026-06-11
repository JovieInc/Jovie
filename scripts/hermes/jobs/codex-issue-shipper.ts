#!/usr/bin/env tsx
/**
 * Codex Issue Shipper — Hermes-Air
 *
 * Watches open GitHub issues labeled `codex`, claims one eligible issue, writes
 * dispatch context to gbrain, then starts a coder-profile agent to ship it.
 *
 * The empty-queue path is intentionally cheap: GitHub scan, log, exit. No
 * gbrain query, model call, subagent, or CodeRabbit work happens unless an
 * issue is eligible and claimed.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import {
  buildAgentCommand,
  buildAgentPrompt,
  buildDispatchPlans,
  buildGbrainCaptureText,
  buildGbrainQuery,
  CODEX_BLOCKED_LABEL,
  CODEX_CLAIM_LABEL,
  type DispatchPlan,
  type GbrainContext,
  type GithubIssue,
  HUMAN_REVIEW_LABEL,
  labelNames,
  loadShipperConfig,
  type ShipperConfig,
} from '../lib/codex-issue-shipper';
import { withHeavyJobLock } from '../lib/heavy-job-lock';
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
      `Codex issue shipper claimed this issue.`,
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
      [`Codex issue shipper stopped on a real blocker.`, '', reason].join('\n')
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

  return {
    captureSlug: gbrainCaptureSlug(captureOut, slug),
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
  prompt: string
): AgentRunResult {
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

  const command = buildAgentCommand(config, plan.route);
  const fd = openSync(logPath, 'a');
  try {
    const result = spawnSync(command.command, [...command.args], {
      cwd: config.repoRoot,
      env: {
        ...process.env,
        JOVIE_AGENT_PROFILE: 'coder',
      },
      input: prompt,
      timeout: config.agentTimeoutMs,
      stdio: ['pipe', fd, fd],
    });
    return {
      ok: result.status === 0,
      status: result.status,
      signal: result.signal,
      error: result.error ? shortError(result.error) : undefined,
      logPath,
      promptPath,
    };
  } finally {
    closeSync(fd);
  }
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
  claimIssue(config, plan);

  let gbrain: GbrainContext;
  try {
    gbrain = collectGbrainContext(plan);
  } catch (err) {
    const reason = `GBrain capture failed, so no coding agent was started.\n\n\`\`\`text\n${shortError(err)}\n\`\`\``;
    markBlocked(config, plan, reason);
    logJobEvent({
      job: JOB,
      event: 'gbrain_failed',
      issue: plan.issue.number,
      error: shortError(err),
    });
    return;
  }

  const prompt = buildAgentPrompt({
    issue: plan.issue,
    branchName: plan.branchName,
    baseBranch: 'main',
    integrationBranch: plan.integrationBranch,
    route: plan.route,
    gbrain,
    repoRoot: config.repoRoot,
  });

  const agentResult = runAgent(config, plan, prompt);
  logJobEvent({
    job: JOB,
    event: agentResult.ok ? 'agent_succeeded' : 'agent_failed',
    issue: plan.issue.number,
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
      plan,
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

  const pr = findPrForBranch(config, plan.branchName);
  if (!pr) {
    markBlocked(
      config,
      plan,
      [
        `Agent exited 0 but no open PR exists for \`${plan.branchName}\`.`,
        '',
        `Log: \`${agentResult.logPath}\``,
        `Prompt: \`${agentResult.promptPath}\``,
      ].join('\n')
    );
    logJobEvent({
      job: JOB,
      event: 'missing_pr_after_success',
      issue: plan.issue.number,
      branch: plan.branchName,
    });
    return;
  }

  commentIssue(
    config,
    plan.issue.number,
    [
      `Codex issue shipper completed agent run and found PR #${pr.number}.`,
      '',
      `PR: ${pr.url}`,
      `GBrain dispatch slug: \`${gbrain.captureSlug}\``,
      `Log: \`${agentResult.logPath}\``,
    ].join('\n')
  );

  logJobEvent({
    job: JOB,
    event: 'pr_found_after_success',
    issue: plan.issue.number,
    pr: pr.number,
    url: pr.url,
  });
}

async function main(): Promise<void> {
  loadHermesEnv();
  const repoRoot = detectRepoRoot();
  const repo = detectGithubRepo(repoRoot);
  const config = loadShipperConfig(process.env, repoRoot, repo);

  await withJobLogging(JOB, async () => {
    const issues = listCodexIssues(config);
    const plans = buildDispatchPlans(issues, config);
    const skippedHuman = issues.filter(issue =>
      labelNames(issue).includes(HUMAN_REVIEW_LABEL)
    ).length;

    logJobEvent({
      job: JOB,
      event: 'scanned',
      issueCount: issues.length,
      dispatchableCount: plans.length,
      skippedHuman,
      maxIssuesPerRun: config.maxIssuesPerRun,
      dryRun: config.dryRun,
    });

    if (plans.length === 0) {
      logJobEvent({ job: JOB, event: 'empty_queue' });
      return;
    }

    if (config.dryRun) {
      logJobEvent({
        job: JOB,
        event: 'dry_run_planned',
        plans: plans.map(plan => ({
          issue: plan.issue.number,
          branch: plan.branchName,
          risk: plan.route.riskLevel,
          model: plan.route.sessionModel,
          integrationBranch: plan.integrationBranch,
        })),
      });
      return;
    }

    ensureControlLabels(config);

    await withHeavyJobLock(JOB, async () => {
      for (const plan of plans) {
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
      }
    });
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
  process.exit(0); // never loop launchd on transient failures
});
