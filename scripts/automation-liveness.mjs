#!/usr/bin/env node
/**
 * Automation liveness (dead-man) check for ops/automation/registry.json.
 *
 * Reads each live entry's hosted-readable run receipt, compares it to the
 * entry's max staleness (critical loops: their heartbeat's max silence), and
 * writes:
 * - a jovie-automation-liveness/v1 report (--output),
 * - jovie-stage-event/v1 run receipts, one started -> finished pair per
 *   observed run plus this check's own run (--events),
 * - remediation decisions for the existing remediation-signal intake
 *   (--decisions), one fingerprint per critical loop.
 *
 * Silence is an alert: an unreadable or missing heartbeat is red.
 *
 * Usage:
 *   node scripts/automation-liveness.mjs [--output f] [--events f]
 *     [--decisions f] [--previous f] [--file]
 * --file applies the decisions through scripts/lib/remediation-signal.mjs
 * (needs LINEAR_API_KEY; REMEDIATION_INTAKE_DISABLED=1 skips).
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  evaluateLiveness,
  livenessDecisions,
  livenessFingerprint,
  loadRegistry,
  readPath,
  runStageEvents,
  validateRegistry,
} from './lib/automation-registry.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 10_000;
const SHA_RE = /^[0-9a-f]{40}$/;

async function readJson(fetchImpl, url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        ...headers,
      },
      signal: controller.signal,
    });
    if (response.status !== 200)
      return { ok: false, reason: `http-${response.status}` };
    return { ok: true, body: await response.json() };
  } catch (error) {
    return {
      ok: false,
      reason: error?.name === 'AbortError' ? 'timeout' : 'transport',
    };
  } finally {
    clearTimeout(timer);
  }
}

function githubHeaders(token) {
  return token
    ? { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }
    : {};
}

/** Last run of a workflow whose conclusion is one of `receipt.conclusions`. */
export async function observeGithubWorkflow(
  receipt,
  { fetchImpl, token, apiUrl = 'https://api.github.com' }
) {
  const conclusions = receipt.conclusions ?? ['success'];
  const branch = receipt.branch
    ? `&branch=${encodeURIComponent(receipt.branch)}`
    : '';
  const url = `${apiUrl}/repos/${receipt.repo}/actions/workflows/${encodeURIComponent(receipt.workflow)}/runs?status=completed&per_page=30${branch}`;
  const read = await readJson(fetchImpl, url, githubHeaders(token));
  if (!read.ok) return { ok: false, reason: `github-${read.reason}` };
  const runs = Array.isArray(read.body?.workflow_runs)
    ? read.body.workflow_runs
    : null;
  if (!runs) return { ok: false, reason: 'github-runs-unreadable' };
  const events = receipt.events ?? null;
  const run = runs.find(
    row =>
      conclusions.includes(row?.conclusion) &&
      (!events || events.includes(row?.event))
  );
  if (!run)
    return {
      ok: true,
      lastProofAt: null,
      reason: `no-${conclusions.join('-or-')}${events ? `-${events.join('-or-')}` : ''}-run-in-last-30`,
    };
  return {
    ok: true,
    lastProofAt: run.updated_at,
    startedAt: run.run_started_at ?? run.created_at,
    endedAt: run.updated_at,
    ref: String(run.id),
    outcome: run.conclusion === 'success' ? 'completed' : 'failed',
    url: run.html_url,
  };
}

/** A timestamp inside a JSON document (status feeds, health routes). */
export async function observeJsonTimestamp(receipt, { fetchImpl }) {
  const read = await readJson(fetchImpl, receipt.url);
  if (!read.ok) return { ok: false, reason: `json-${read.reason}` };
  const value = readPath(read.body, receipt.path);
  if (value === undefined || value === null) {
    return {
      ok: true,
      lastProofAt: null,
      reason: `heartbeat-source-missing:${receipt.path}`,
    };
  }
  if (receipt.okPath) {
    const okValue = readPath(read.body, receipt.okPath);
    if (!(receipt.okValues ?? ['verified', 'ok', true]).includes(okValue)) {
      return {
        ok: true,
        lastProofAt: null,
        reason: `heartbeat-not-ok:${receipt.okPath}=${String(okValue)}`,
      };
    }
  }
  return { ok: true, lastProofAt: value, url: receipt.url };
}

/**
 * Production promotion heartbeat, independent of the continuity guard's own
 * verdict: production carrying main is a fresh proof; otherwise the proof is
 * as old as the oldest commit production is missing. Unreadable is unknown
 * (red), never healthy.
 */
export async function observeProductionFreshness(
  receipt,
  { fetchImpl, token, nowMs, apiUrl = 'https://api.github.com' }
) {
  const build = await readJson(fetchImpl, receipt.buildInfoUrl);
  const live = build.ok ? build.body?.commitSha : null;
  if (!SHA_RE.test(live ?? ''))
    return { ok: false, reason: 'live-sha-unreadable' };
  const headers = githubHeaders(token);
  const head = await readJson(
    fetchImpl,
    `${apiUrl}/repos/${receipt.repo}/commits/main`,
    headers
  );
  const main = head.ok ? head.body?.sha : null;
  if (!SHA_RE.test(main ?? ''))
    return { ok: false, reason: 'main-sha-unreadable' };
  const now = new Date(nowMs).toISOString();
  if (live === main)
    return { ok: true, lastProofAt: now, reason: 'production-current' };
  const compare = await readJson(
    fetchImpl,
    `${apiUrl}/repos/${receipt.repo}/compare/${live}...${main}`,
    headers
  );
  if (!compare.ok) return { ok: false, reason: 'unshipped-range-unreadable' };
  if (Number(compare.body?.ahead_by) === 0)
    return { ok: true, lastProofAt: now, reason: 'production-current' };
  const oldest = compare.body?.commits?.[0]?.commit?.committer?.date;
  if (!Number.isFinite(Date.parse(oldest ?? '')))
    return { ok: false, reason: 'unshipped-age-unreadable' };
  return {
    ok: true,
    lastProofAt: oldest,
    reason: `${compare.body.ahead_by}-commits-unshipped`,
  };
}

export async function observeEntry(entry, context) {
  const receipt = entry.receipt ?? {};
  if (receipt.kind === 'github-workflow')
    return observeGithubWorkflow(receipt, context);
  if (receipt.kind === 'json-timestamp')
    return observeJsonTimestamp(receipt, context);
  if (receipt.kind === 'production-freshness')
    return observeProductionFreshness(receipt, context);
  return null;
}

/**
 * @typedef {(url: string, init?: any) => Promise<{status: number, json: () => Promise<any>}>} FetchLike
 * @param {{registry: any, fetchImpl?: FetchLike, token?: string, nowMs?: number}} options
 */
export async function runLiveness({
  registry,
  fetchImpl = fetch,
  token = '',
  nowMs = Date.now(),
}) {
  const startedAt = new Date(nowMs).toISOString();
  const observations = new Map();
  const context = { fetchImpl, token, nowMs };
  for (const entry of registry.entries ?? []) {
    if (entry?.status !== 'live') continue;
    const observed = await observeEntry(entry, context);
    if (observed) observations.set(entry.id, observed);
  }
  const report = evaluateLiveness(registry, observations, nowMs);
  const events = [];
  for (const [id, observed] of observations) {
    if (!observed?.startedAt || !observed?.endedAt) continue;
    events.push(
      ...runStageEvents({
        automationId: id,
        runRef: observed.ref,
        startedAt: observed.startedAt,
        endedAt: observed.endedAt,
        outcome: observed.outcome,
        sourceReceipt: observed.url,
      })
    );
  }
  return { report, events, startedAt };
}

function parseArgs(argv) {
  const args = { file: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--file') args.file = true;
    else if (
      ['--output', '--events', '--decisions', '--previous'].includes(flag) &&
      argv[index + 1]
    ) {
      args[flag.slice(2)] = argv[index + 1];
      index += 1;
    } else throw new Error(`unsupported argument: ${flag}`);
  }
  return args;
}

function readPrevious(path) {
  if (!path) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function summary(report) {
  const rows = report.results
    .map(
      row =>
        `| ${row.id} | ${row.critical ? 'yes' : ''} | ${row.status} | ${row.lastProofAt ?? 'none'} | ${row.budgetMinutes}m | ${row.reason ?? ''} |`
    )
    .join('\n');
  return [
    `### Automation liveness: ${report.status}`,
    '',
    '| id | critical | status | last heartbeat | budget | reason |',
    '|---|---|---|---|---|---|',
    rows,
    '',
    `${report.unmeasured.length} live entries have no hosted-readable receipt (see registry \`gap\`).`,
    '',
  ].join('\n');
}

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const args = parseArgs(argv);
  const registry = loadRegistry(REPO_ROOT);
  const invalid = validateRegistry(registry);
  if (invalid.length)
    throw new Error(`registry invalid:\n${invalid.join('\n')}`);
  const { report, events, startedAt } = await runLiveness({
    registry,
    fetchImpl,
    token: env.GH_TOKEN ?? env.GITHUB_TOKEN ?? '',
  });
  const endedAt = new Date().toISOString();
  const runUrl = env.GITHUB_RUN_ID
    ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
    : null;
  if (runUrl) {
    events.push(
      ...runStageEvents({
        automationId: 'github:jovie:automation-liveness',
        runRef: env.GITHUB_RUN_ID,
        startedAt,
        endedAt,
        outcome: 'completed',
        sourceReceipt: runUrl,
      })
    );
  }
  const previous = readPrevious(args.previous);
  const decisions = livenessDecisions(report, previous);
  const full = { ...report, startedAt, endedAt, runUrl, decisions };
  if (args.output)
    writeFileSync(args.output, `${JSON.stringify(full, null, 2)}\n`);
  if (args.events)
    writeFileSync(
      args.events,
      events.map(row => JSON.stringify(row)).join('\n') +
        (events.length ? '\n' : '')
    );
  if (args.decisions)
    writeFileSync(args.decisions, `${JSON.stringify(decisions, null, 2)}\n`);
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(env.GITHUB_STEP_SUMMARY, summary(report));

  const state = { ...previous };
  for (const row of report.results) {
    if (row.critical)
      state[livenessFingerprint(row.id)] =
        row.status === 'fresh' ? 'green' : 'red';
  }
  if (args.file && env.REMEDIATION_INTAKE_DISABLED !== '1') {
    const { applyRemediationDecisionWithRetry } = await import(
      './lib/remediation-signal.mjs'
    );
    for (const decision of decisions) {
      const result = await applyRemediationDecisionWithRetry(decision, {
        fingerprint: decision.fingerprint,
        source: 'automation-liveness.yml',
        runUrl,
        detail: decision.detail,
        apiKey: env.LINEAR_API_KEY,
      });
      process.stdout.write(
        `${JSON.stringify({ fingerprint: decision.fingerprint, action: decision.action, ok: result.ok, reason: 'reason' in result ? result.reason : null })}\n`
      );
      // Keep the prior state when filing failed so the next run retries.
      if (!result.ok)
        state[decision.fingerprint] =
          previous[decision.fingerprint] ?? 'unknown';
    }
  }
  if (args.previous)
    writeFileSync(args.previous, `${JSON.stringify(state, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({ status: report.status, red: report.results.filter(row => row.status !== 'fresh').map(row => row.id) })}\n`
  );
  return full;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    process.stderr.write(
      `automation-liveness: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  });
}
