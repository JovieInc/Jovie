#!/usr/bin/env node
/**
 * Old-PR rule (Tim 2026-11-22, "Yes, close at 10 days"; JOV-INV-011 v5).
 *
 * An agent PR gets one last repair try at `lastTryDays` old: the
 * `last-repair-try` and `lane-fix-stale` labels, a merge of main so CI runs
 * again, and a comment with its close date. At `closeDays` old it is closed and
 * its Linear issue goes back to Backlog. The branch is kept.
 *
 * Producers come from scripts/lanes/pr-wip-policy.json, the same list the
 * per-agent caps use: Tim's own branches, dependabot and queue refs are exempt.
 * Human holds and PRs already merging are skipped. Pure planning is default;
 * `--apply` acts. Any failed action exits 1, so the run reports a repair.
 *
 * api-budget: linear-requests 30/hr - one lookup and one state update per closed PR, at most maxClosesPerRun per run
 * api-budget: github-app-core 60/hr - open-PR list (2 pages) per main push, plus 3 calls per last try and 1 per close, capped per run
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { linearRequest } from '../lib/linear-cooldown.mjs';
import { extractLinearIdentifier } from '../lib/needs-human-autoclose.mjs';

export const SCHEMA = 'jovie-summer-pr-age-rule/v1';
export const LAST_TRY_LABEL = 'last-repair-try';
export const REPAIR_LABEL = 'lane-fix-stale';
export const HOLD_LABELS = new Set(['hold', 'gated', 'incident']);
const DAY_MS = 86_400_000;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const POLICY_PATH = resolve(ROOT, 'scripts/lanes/pr-wip-policy.json');

/** Mirrors producer_of in scripts/lanes/pr_wip.py. */
export function producerOf(branch) {
  const ref = String(branch ?? '').trim();
  return ref.includes('/') ? ref.split('/', 1)[0].toLowerCase() : '(none)';
}

/** @param {string} [path] */
export function readPolicy(path = POLICY_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * @param {{number: number, createdAt: string, headRefName: string, labels: string[], autoMerge: boolean}[]} prs
 * @param {{nowMs: number, policy: any}} options
 */
export function planAgeRule(prs, { nowMs, policy }) {
  const rule = policy?.ageRule ?? {};
  if (rule.enabled !== true) return { tries: [], closes: [], disabled: true };
  const exempt = new Set(policy.exemptProducers ?? []);
  const rows = [];
  for (const pr of prs) {
    const producer = producerOf(pr.headRefName);
    const labels = new Set((pr.labels ?? []).map(l => String(l).toLowerCase()));
    if (producer === '(none)' || exempt.has(producer)) continue;
    if ([...labels].some(l => HOLD_LABELS.has(l)) || pr.autoMerge) continue;
    const created = Date.parse(pr.createdAt);
    if (!Number.isFinite(created)) continue;
    const ageDays = (nowMs - created) / DAY_MS;
    rows.push({ ...pr, producer, ageDays, tried: labels.has(LAST_TRY_LABEL) });
  }
  rows.sort((a, b) => b.ageDays - a.ageDays);
  const closes = rows
    .filter(r => r.ageDays >= rule.closeDays)
    .slice(0, rule.maxClosesPerRun);
  const tries = rows
    .filter(
      r =>
        r.ageDays >= rule.lastTryDays && r.ageDays < rule.closeDays && !r.tried
    )
    .slice(0, rule.maxTriesPerRun);
  return { tries, closes, disabled: false };
}

export function closeDate(createdAt, closeDays) {
  return new Date(Date.parse(createdAt) + closeDays * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function tryComment(pr, rule) {
  return [
    `This PR is ${Math.floor(pr.ageDays)} days old, so this is its last repair try: main is merged in and \`${REPAIR_LABEL}\` asks a lane to finish it.`,
    `If it has not merged by ${closeDate(pr.createdAt, rule.closeDays)} (${rule.closeDays} days old), it will be closed and its Linear issue moved back to Backlog. The branch is kept.`,
  ].join('\n\n');
}

export function closeComment(pr, rule, linearNote) {
  return [
    `Closing: this PR is ${Math.floor(pr.ageDays)} days old and did not land after its last repair try (old-PR rule: one last try at ${rule.lastTryDays} days, close at ${rule.closeDays}).`,
    linearNote,
    `The branch \`${pr.headRefName}\` is kept, so nothing is lost: reopen this PR or open a fresh one from main when someone picks the work up again.`,
  ].join('\n\n');
}

/** @typedef {(bin: string, args: string[], options?: object) => {status: number | null, stdout?: string, stderr?: string}} RunCommand */

/** @param {string[]} args @param {RunCommand} [run] */
function gh(args, run = /** @type {RunCommand} */ (spawnSync)) {
  const done = run('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: done.status === 0,
    stdout: done.stdout ?? '',
    stderr: done.stderr ?? '',
  };
}

/** @param {string} repo @param {RunCommand} [run] */
export function listOpenPrs(repo, run = /** @type {RunCommand} */ (spawnSync)) {
  const listed = gh(
    [
      'api',
      '--paginate',
      `repos/${repo}/pulls?state=open&per_page=100`,
      '--jq',
      '.[] | {number, createdAt: .created_at, headRefName: .head.ref, labels: [.labels[].name], autoMerge: (.auto_merge != null), body: (.body // "")}',
    ],
    run
  );
  if (!listed.ok)
    throw new Error(`open PR list failed: ${listed.stderr.trim()}`);
  return listed.stdout
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

/**
 * Move the PR's Linear issue to Backlog unless it is already done or canceled.
 * @param {{identifier: string, apiKey?: string, fetchImpl?: typeof fetch}} input
 */
export async function moveIssueToBacklog({
  identifier,
  apiKey,
  fetchImpl = fetch,
}) {
  if (!identifier) return { ok: true, action: 'no-issue' };
  if (!apiKey) return { ok: false, action: 'missing-linear-key' };
  const found = await linearRequest({
    key: apiKey,
    query:
      'query AgeRuleIssue($id: String!) { issue(id: $id) { id state { type } team { states { nodes { id name type } } } } }',
    variables: { id: identifier },
    fetchImpl,
  });
  const issue = found?.data?.data?.issue;
  if (!found?.ok || !issue) return { ok: false, action: 'issue-lookup-failed' };
  if (['completed', 'canceled', 'backlog'].includes(issue.state?.type)) {
    return { ok: true, action: `left-${issue.state.type}` };
  }
  const states = issue.team?.states?.nodes ?? [];
  const backlog =
    states.find(s => s?.name === 'Backlog') ??
    states.find(s => s?.type === 'backlog');
  if (!backlog) return { ok: false, action: 'no-backlog-state' };
  const moved = await linearRequest({
    key: apiKey,
    query:
      'mutation AgeRuleBacklog($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success } }',
    variables: { id: issue.id, stateId: backlog.id },
    fetchImpl,
  });
  return moved?.ok && moved?.data?.data?.issueUpdate?.success
    ? { ok: true, action: 'moved-to-backlog' }
    : { ok: false, action: 'backlog-update-failed' };
}

/**
 * @param {{tries: any[], closes: any[]}} plan
 * @param {{repo: string, rule: any, apiKey?: string, run?: RunCommand, fetchImpl?: typeof fetch}} options
 */
export async function applyAgeRule(
  plan,
  {
    repo,
    rule,
    apiKey,
    run = /** @type {RunCommand} */ (spawnSync),
    fetchImpl = fetch,
  }
) {
  const out = { tried: [], closed: [], failed: [] };
  for (const pr of plan.tries) {
    const label = gh(
      [
        'pr',
        'edit',
        String(pr.number),
        '--repo',
        repo,
        '--add-label',
        `${LAST_TRY_LABEL},${REPAIR_LABEL}`,
      ],
      run
    );
    if (!label.ok) {
      out.failed.push({ pr: pr.number, step: 'label' });
      continue;
    }
    // A conflict makes update-branch fail; the lane's conflict repair takes it from there.
    const merged = gh(
      ['api', '-X', 'PUT', `repos/${repo}/pulls/${pr.number}/update-branch`],
      run
    );
    gh(
      [
        'pr',
        'comment',
        String(pr.number),
        '--repo',
        repo,
        '--body',
        tryComment(pr, rule),
      ],
      run
    );
    out.tried.push({ pr: pr.number, mainMerged: merged.ok });
  }
  for (const pr of plan.closes) {
    const identifier = extractLinearIdentifier({
      headRefName: pr.headRefName,
      body: pr.body ?? '',
    });
    const linear = await moveIssueToBacklog({ identifier, apiKey, fetchImpl });
    const linearNote = !identifier
      ? 'No Linear issue was linked on the branch or PR body.'
      : linear.action === 'moved-to-backlog'
        ? `Its Linear issue ${identifier} is back in Backlog.`
        : `Its Linear issue ${identifier} was left as it was (${linear.action}).`;
    const closed = gh(
      [
        'pr',
        'close',
        String(pr.number),
        '--repo',
        repo,
        '--comment',
        closeComment(pr, rule, linearNote),
      ],
      run
    );
    if (!closed.ok) out.failed.push({ pr: pr.number, step: 'close' });
    else
      out.closed.push({
        pr: pr.number,
        linear: identifier || null,
        linearAction: linear.action,
      });
    if (!linear.ok)
      out.failed.push({ pr: pr.number, step: `linear:${linear.action}` });
  }
  return out;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const apply = argv.includes('--apply');
  const repo = env.GH_REPO || 'JovieInc/Jovie';
  const policy = readPolicy();
  const plan = planAgeRule(listOpenPrs(repo), { nowMs: Date.now(), policy });
  const summary = {
    schema: SCHEMA,
    apply,
    tries: plan.tries.map(p => p.number),
    closes: plan.closes.map(p => p.number),
  };
  if (apply && !plan.disabled) {
    Object.assign(
      summary,
      await applyAgeRule(plan, {
        repo,
        rule: policy.ageRule,
        apiKey: env.LINEAR_API_KEY,
      })
    );
  }
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  return summary.failed?.length ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().then(
    code => {
      process.exitCode = code;
    },
    error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  );
}
