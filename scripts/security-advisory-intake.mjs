#!/usr/bin/env node
// Security-advisory loop: Dependabot alert -> owned Linear issue (devin lane)
// with a severity SLA -> closed only when the alert is fixed on main AND a
// Production deploy landed after the fix. `--check` is the ratchet: a critical,
// high or medium advisory past its SLA with no active exception fails the run.
//
//   node scripts/security-advisory-intake.mjs [--check] [--dry-run]
//
// Env: GH_TOKEN (deployments), ALERTS_TOKEN (Dependabot alerts read; falls back
// to GH_TOKEN), LINEAR_API_KEY, GITHUB_REPOSITORY, RECEIPT_PATH.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGh } from '../packages/api-client/gh.ts';
import { resolveLabelId } from './deprecation-intake.mjs';
import { linearRequest } from './lib/linear-cooldown.mjs';
import {
  closeLinearIssueByFingerprint,
  JOVIE_TEAM_ID,
  resolveLinearIssueByFingerprint,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';
import {
  issueDescription,
  issueTitle,
  LINEAR_PRIORITY,
  planAdvisories,
} from './lib/security-advisory-policy.mjs';

export const MAX_UPSERTS_PER_RUN = 60;

// One paged scan replaces one Linear search per fixed advisory. The close list
// re-attempts every historical fixed group on every run (~340 groups on run
// 43179965779): those per-group searches sustained several hundred Linear
// requests per run, tripped the shared key's rate limit mid-loop, and every
// later close then failed with linear_rate_limited, failing the run. A close
// can only act on an issue that exists, so candidates are resolved from a
// single scan and groups with no issue are recorded as `none` for free.
export const CLOSE_SCAN_TITLE_TEXT = 'secadv-';
export const CLOSE_SCAN_LABEL_PREFIX = 'remediation:secadv-';
export const CLOSE_SCAN_PAGE_SIZE = 100;
export const CLOSE_SCAN_MAX_PAGES = 5;

const CLOSE_CANDIDATE_FIELDS = `
  id identifier url title
  state { id name type }
  labels(first: 50) { nodes { id name } }
`;

export async function listSecadvIssueCandidates({
  apiKey = process.env.LINEAR_API_KEY,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) return { ok: false, reason: 'missing_linear_api_key' };
  const nodes = [];
  let cursor = null;
  for (let page = 0; page < CLOSE_SCAN_MAX_PAGES; page += 1) {
    const result = await linearRequest({
      key: apiKey,
      query: `
        query ListSecadvCloseCandidates(
          $teamFilterId: ID!
          $titleText: String!
          $labelPrefix: String!
          $pageSize: Int!
          $cursor: String
        ) {
          issues(
            filter: {
              team: { id: { eq: $teamFilterId } }
              or: [
                { title: { contains: $titleText } }
                { labels: { some: { name: { startsWith: $labelPrefix } } } }
              ]
            }
            first: $pageSize
            after: $cursor
          ) {
            nodes { ${CLOSE_CANDIDATE_FIELDS} }
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
      variables: {
        teamFilterId: JOVIE_TEAM_ID,
        titleText: CLOSE_SCAN_TITLE_TEXT,
        labelPrefix: CLOSE_SCAN_LABEL_PREFIX,
        pageSize: CLOSE_SCAN_PAGE_SIZE,
        cursor,
      },
      fetchImpl,
    });
    if (result.rateLimited) {
      return {
        ok: false,
        reason: 'linear_rate_limited',
        resetAt: result.resetAt,
      };
    }
    if (!result.ok) {
      return {
        ok: false,
        reason: `linear_close_scan_${result.status ?? 'error'}`,
      };
    }
    if (Array.isArray(result.data?.errors) && result.data.errors.length > 0) {
      return {
        ok: false,
        reason: 'linear_close_scan_graphql_error',
        body: result.data.errors,
      };
    }
    const collection = result.data?.data?.issues;
    nodes.push(...(collection?.nodes ?? []));
    const pageInfo = collection?.pageInfo;
    if (!pageInfo?.hasNextPage) return { ok: true, nodes, truncated: false };
    cursor = pageInfo.endCursor;
  }
  return { ok: true, nodes, truncated: true };
}
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function gh(args, token, { paginate = true } = {}) {
  const env = token ? { ...process.env, GH_TOKEN: token } : process.env;
  const result = await runGh(
    ['api', ...(paginate ? ['--paginate', '--slurp'] : []), ...args],
    { env, priority: 'report' }
  );
  if (result.code !== 0)
    throw Object.assign(
      new Error(`GitHub advisory read failed (exit ${result.code}).`),
      { exitCode: result.code }
    );
  const out = JSON.parse(result.stdout);
  return paginate ? out.flat() : out;
}

export async function latestProductionDeploy(repo, token) {
  const deployments = await gh(
    [`repos/${repo}/deployments?per_page=40`],
    token,
    { paginate: false }
  );
  for (const d of deployments
    .filter(x => /^production/i.test(x.environment))
    .slice(0, 12)) {
    const [status] = await gh(
      [`repos/${repo}/deployments/${d.id}/statuses?per_page=1`],
      token,
      { paginate: false }
    );
    if (status?.state === 'success') return d.created_at;
  }
  return null;
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  ];
}

/** p50/p95 detect->fixed and fixed->deployed hours, from the alert history itself. */
export function stageMetrics(alerts, deployedAt) {
  const detectToFix = [];
  for (const a of alerts) {
    if (a.state === 'fixed' && a.fixed_at)
      detectToFix.push(
        (Date.parse(a.fixed_at) - Date.parse(a.created_at)) / 3_600_000
      );
  }
  return {
    detectToFixedHours: {
      n: detectToFix.length,
      p50: percentile(detectToFix, 50),
      p95: percentile(detectToFix, 95),
    },
    latestProductionDeployAt: deployedAt,
  };
}

export const BLIND_FINGERPRINT = 'secadv-blind-source';

/**
 * Dependabot alerts unreadable (the Jovie Bot installation lacks the
 * "Dependabot alerts: read" permission, run 40924917151). A silent zero would
 * read as "no advisories", so write a blind receipt and file ONE owned Linear
 * card naming the grant; the findings loop counts the blind source as a breach.
 * The check remains red while blind; syncing requires a successful repair card.
 */
export async function recordBlindSource(
  { repo, error, dryRun = false, check = false, now },
  {
    resolveLabel = resolveLabelId,
    upsert = /** @type {(input: Parameters<typeof upsertLinearIssueByTitleFingerprint>[0]) => Promise<{ok: boolean, action?: string}>} */ (
      upsertLinearIssueByTitleFingerprint
    ),
  } = {}
) {
  const receipt = {
    schema: 'jovie.security-advisory-receipt/v1',
    observedAt: now.toISOString(),
    repo,
    blind: true,
    reason: String(error?.message ?? error).slice(0, 200),
    actions: [],
  };
  const receiptPath =
    process.env.RECEIPT_PATH || 'security-advisory-receipt.json';
  // Preserve evidence even if the repair-card write fails or is unconfigured.
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  if (!dryRun && !check) {
    if (!process.env.LINEAR_API_KEY)
      throw new Error(
        'LINEAR_API_KEY is required to report a blind advisory source'
      );
    const devin = await resolveLabel('devin', process.env.LINEAR_API_KEY);
    if (!devin) throw new Error('Linear label "devin" not found');
    const r = await upsert({
      fingerprint: BLIND_FINGERPRINT,
      title: `Grant Dependabot alerts read to the Jovie Bot app [${BLIND_FINGERPRINT}]`,
      description:
        'The Security Advisory Loop cannot read Dependabot alerts: the Jovie Bot GitHub App installation lacks "Dependabot alerts: read" (create-github-app-token 422). ' +
        'Grant it in the app settings and accept the installation update; the next loop run (clock every 4h or push) then reads alerts and files owned work. ' +
        'Until then advisories are unobserved. Needs Tim (Ovie card): app permission changes are an owner action.',
      priority: 2,
      createStateName: 'Todo',
      reopenTerminal: true,
      createLabelIds: devin ? [devin] : [],
    });
    receipt.actions.push({
      fingerprint: BLIND_FINGERPRINT,
      ok: r.ok,
      action: r.action,
    });
  }
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ ...receipt, actions: receipt.actions.length }));
  if (process.env.GITHUB_ACTIONS === 'true')
    console.log(
      `::warning::Dependabot alerts unreadable (${receipt.reason}); loop is blind.`
    );
  if (receipt.actions.some(action => !action.ok))
    throw new Error('Failed to persist the blind advisory repair card');
}

/**
 * Run the planned closes against the scanned candidates. Fail-closed by
 * construction: any close failure (including a rate limit on the last group,
 * where no deferred group would otherwise fail the run) marks the result not
 * ok, and the caller exits 1. Rate-limited closes stop the loop; the remaining
 * groups are deferred with ok:false so incomplete Linear work is never green.
 */
/**
 * @typedef {Object} AdvisoryCloseResult
 * @property {boolean} ok
 * @property {string} [action]
 * @property {string} [reason]
 */
/**
 * @param {Object} input
 * @param {Array<{fingerprint: string, fixedAt?: string, deployedAt?: string}>} input.closes
 * @param {Array<unknown>} input.candidates
 * @param {string} [input.runId]
 * @param {string} [input.comment]
 * @param {(group: {fingerprint: string, fixedAt?: string, deployedAt?: string}) => string} [input.commentFor]
 * @param {(input: {fingerprint: string, runId?: string, comment?: string}) => Promise<AdvisoryCloseResult>} [input.close]
 * @returns {Promise<{actions: Array<{fingerprint: string, op: string, ok: boolean, action: string | undefined}>, ok: boolean}>}
 */
export async function runAdvisoryCloses({
  closes,
  candidates,
  runId,
  comment,
  commentFor = null,
  close = closeLinearIssueByFingerprint,
}) {
  const actions = [];
  let rateLimited = false;
  let failed = false;
  for (const g of closes) {
    const candidate = rateLimited
      ? null
      : resolveLinearIssueByFingerprint(candidates, g.fingerprint);
    if (!candidate) {
      actions.push({
        fingerprint: g.fingerprint,
        op: 'close',
        ok: !rateLimited,
        action: rateLimited ? 'deferred_rate_limited' : 'none',
      });
      if (rateLimited) failed = true;
      continue;
    }
    const r = await close({
      fingerprint: g.fingerprint,
      runId,
      comment: commentFor ? commentFor(g) : comment,
    });
    actions.push({
      fingerprint: g.fingerprint,
      op: 'close',
      ok: r.ok,
      action: r.action,
    });
    if (!r.ok) {
      if (r.reason === 'linear_rate_limited') rateLimited = true;
      failed = true;
    }
  }
  return { actions, ok: !failed };
}

async function main() {
  const argv = new Set(process.argv.slice(2));
  const check = argv.has('--check');
  const dryRun = argv.has('--dry-run');
  const repo = process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
  const alertsToken = process.env.ALERTS_TOKEN || process.env.GH_TOKEN;
  const now = new Date();
  let alerts;
  try {
    alerts = [
      ...(await gh(
        [`repos/${repo}/dependabot/alerts?state=open&per_page=100`],
        alertsToken
      )),
      ...(await gh(
        [`repos/${repo}/dependabot/alerts?state=fixed&per_page=100`],
        alertsToken
      )),
    ];
  } catch (error) {
    // Quota deferral (75) is not blindness: let the caller defer the run.
    if (error.exitCode === 75) throw error;
    await recordBlindSource({ repo, error, dryRun, check, now });
    if (check) process.exitCode = 1;
    return;
  }
  const deployedAt = await latestProductionDeploy(repo, process.env.GH_TOKEN);
  const exceptions = JSON.parse(
    readFileSync(
      path.join(ROOT, 'scripts/security/advisory-exceptions.json'),
      'utf8'
    )
  ).exceptions;
  const plan = planAdvisories({ alerts, exceptions, deployedAt, now });
  const receipt = {
    schema: 'jovie.security-advisory-receipt/v1',
    observedAt: now.toISOString(),
    repo,
    open: plan.upserts.length,
    openBySeverity: plan.upserts.reduce(
      (m, g) => ({ ...m, [g.severity]: (m[g.severity] ?? 0) + 1 }),
      {}
    ),
    awaitingDeploy: plan.awaitingDeploy.map(g => g.fingerprint),
    breaches: plan.breaches.map(g => ({
      fingerprint: g.fingerprint,
      severity: g.severity,
      dueAt: g.dueAt,
    })),
    expiredExceptions: plan.expiredExceptions.map(e => e.ghsa),
    stages: stageMetrics(alerts, deployedAt),
    actions: [],
  };

  if (!check && !dryRun) {
    if (!process.env.LINEAR_API_KEY)
      throw new Error('LINEAR_API_KEY is required');
    const devin = await resolveLabelId('devin', process.env.LINEAR_API_KEY);
    if (!devin) throw new Error('Linear label "devin" not found');
    for (const g of plan.upserts.slice(0, MAX_UPSERTS_PER_RUN)) {
      const r = await upsertLinearIssueByTitleFingerprint({
        fingerprint: g.fingerprint,
        title: issueTitle(g),
        description: issueDescription(g),
        priority: LINEAR_PRIORITY[g.severity],
        createStateName: 'Todo',
        reopenTerminal: true,
        createLabelIds: [devin],
      });
      receipt.actions.push({
        fingerprint: g.fingerprint,
        op: 'upsert',
        ok: r.ok,
        action: r.action,
        id: r.identifier,
      });
      if (!r.ok) process.exitCode = 1;
    }
    if (plan.closes.length > 0) {
      const scan = await listSecadvIssueCandidates({
        apiKey: process.env.LINEAR_API_KEY,
      });
      if (!scan.ok) {
        receipt.actions.push({
          fingerprint: 'secadv-close-scan',
          op: 'scan',
          ok: false,
          action: scan.reason,
        });
        process.exitCode = 1;
      } else {
        receipt.closeScan = {
          scanned: scan.nodes.length,
          truncated: scan.truncated,
        };
        const closeResult = await runAdvisoryCloses({
          closes: plan.closes,
          candidates: scan.nodes,
          runId: process.env.GITHUB_RUN_ID || now.toISOString(),
          commentFor: g =>
            `Fixed on main at ${g.fixedAt} and deployed: Production deployment at ${g.deployedAt} postdates the fix.`,
        });
        receipt.actions.push(...closeResult.actions);
        if (!closeResult.ok) process.exitCode = 1;
      }
    }
  }

  writeFileSync(
    process.env.RECEIPT_PATH || 'security-advisory-receipt.json',
    JSON.stringify(receipt, null, 2)
  );
  console.log(JSON.stringify({ ...receipt, actions: receipt.actions.length }));
  if (
    check &&
    (plan.breaches.length > 0 || plan.expiredExceptions.length > 0)
  ) {
    for (const b of plan.breaches)
      console.error(
        `SLA breach: ${b.severity} ${b.package} (${b.ghsa}) due ${b.dueAt}`
      );
    for (const e of plan.expiredExceptions)
      console.error(
        `Expired exception: ${e.ghsa} ${e.package} expired ${e.expires}`
      );
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  }
}
