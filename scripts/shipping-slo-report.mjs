#!/usr/bin/env node
/**
 * Shipping SLO ratchet (JOV-6783) — deterministic, GitHub-API-only, zero-token.
 *
 *   node scripts/shipping-slo-report.mjs validate
 *       Validate docs/metrics/shipping-slo-baseline.json. Exit 1 on error.
 *
 *   node scripts/shipping-slo-report.mjs report [--input raw.json]
 *          [--workflows ci.yml,...] [--days 21] [--write-latest]
 *          [--ratchet] [--json out.json]
 *       Collect GitHub signals (or read a previously-collected raw snapshot),
 *       compute rolling 7d p50/p95 metrics, evaluate them against the
 *       committed baseline, and print a verdict. Options:
 *         --write-latest  write docs/metrics/shipping-slo-latest.json
 *         --ratchet       tighten the baseline in place when an improvement
 *                         has held >= improvementHoldDays (writes file)
 *         --json <path>   write the full machine-readable report
 *       Exit 0 always on success; the verdict object carries regressions so
 *       the workflow can decide whether to file slo-regression issues.
 *
 * Raw input shape (produced by `collect` / consumed by `report`):
 *   { collectedAt, runs: {pull_request:[], merge_group:[], main:[]},
 *     mergedPrs: [{number,title,headRefName,createdAt,mergedAt,mergeCommitSha}],
 *     timelines: { <prNumber>: [{type, at}] },
 *     deployments: [{status, createdAt, sha}] }
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBlogPublishLatency,
  findBlogQualificationRun,
  isStrictBlogContentPr,
} from './lib/blog-publish-latency.mjs';
import {
  buildGistSloBlock,
  ciWalltimeByEvent,
  evaluateShippingSlo,
  flattenMetrics,
  leadTimeByLane,
  mergeQueueStats,
  prLane,
  productionLag,
  ratchetBaseline,
  remediationStats,
  throughputTrend,
  validateBaseline,
} from './lib/shipping-slo.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const BASELINE_PATH = resolve(
  REPO_ROOT,
  'docs/metrics/shipping-slo-baseline.json'
);
const LATEST_PATH = resolve(REPO_ROOT, 'docs/metrics/shipping-slo-latest.json');
const BLOG_LATENCY_PATH = resolve(
  REPO_ROOT,
  'docs/metrics/blog-publish-latency-latest.json'
);
const TIMELINE_PR_LIMIT = 80;
const DEPLOYMENT_LIMIT = 60;

function argValue(args, flag, fallback) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : fallback;
}
const hasArg = (args, flag) => args.includes(flag);

function gh(args, { parseJson = true } = {}) {
  const out = execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GH_PAGER: 'cat' },
  });
  return parseJson ? JSON.parse(out) : out;
}

function repo() {
  return (
    process.env.GH_REPO || process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie'
  );
}

/** Fetch everything the metric layer needs. All reads, ~150 API calls. */
export function collectRaw({ workflows, days }) {
  const ghRepo = repo();
  const sinceMs = Date.now() - days * 86_400_000;
  const sinceIso = new Date(sinceMs).toISOString();

  const runs = { pull_request: [], merge_group: [], main: [] };
  for (const wf of workflows) {
    for (const [bucket, params] of [
      ['pull_request', `event=pull_request`],
      ['merge_group', `event=merge_group`],
      ['main', `event=push&branch=main`],
    ]) {
      try {
        const page = gh([
          'api',
          `repos/${ghRepo}/actions/workflows/${wf}/runs?created=>=${encodeURIComponent(sinceIso)}&${params}&per_page=100`,
          '--jq',
          '[.workflow_runs[] | {id, event, path, status, conclusion, head_branch, head_sha, created_at, updated_at, run_started_at, run_attempt, prNumbers: [(.pull_requests // [])[].number]}]',
        ]);
        const parsed = typeof page === 'string' ? JSON.parse(page) : page;
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const r of list) runs[bucket].push({ ...r, workflow: wf });
      } catch (error) {
        console.error(
          `[shipping-slo] warn: runs fetch failed for ${wf} (${bucket}): ${error.message}`
        );
      }
    }
  }

  let mergedPrs = [];
  try {
    mergedPrs = gh([
      'pr',
      'list',
      '--repo',
      ghRepo,
      '--state',
      'merged',
      '--search',
      `merged:>=${sinceIso.slice(0, 10)}`,
      '--json',
      'number,title,headRefName,headRefOid,createdAt,mergedAt,mergeCommit',
      '--limit',
      '300',
    ]).map(pr => ({ ...pr, mergeCommitSha: pr.mergeCommit?.oid ?? null }));
  } catch (error) {
    console.error(
      `[shipping-slo] warn: merged PR fetch failed: ${error.message}`
    );
  }

  const timelines = {};
  const recent = [...mergedPrs]
    .filter(p => p.mergedAt)
    .sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt))
    .slice(0, TIMELINE_PR_LIMIT);
  for (const pr of recent) {
    try {
      const events = gh([
        'api',
        `repos/${ghRepo}/issues/${pr.number}/timeline`,
        '--paginate',
        '--jq',
        '.[] | {type: .event, at: (.created_at // .submitted_at)}',
      ]);
      const list = Array.isArray(events) ? events : [events];
      timelines[pr.number] = list.filter(
        e =>
          e &&
          e.at &&
          [
            'added_to_merge_queue',
            'removed_from_merge_queue',
            'merged',
          ].includes(e.type)
      );
    } catch {
      // Timeline is best-effort; missing PRs just reduce queue sample size.
    }

    try {
      pr.files = gh([
        'api',
        `repos/${ghRepo}/pulls/${pr.number}/files?per_page=100`,
        '--paginate',
        '--slurp',
        '--jq',
        '[.[][] | {filename, status, previousFilename: .previous_filename}]',
      ]);
    } catch {
      pr.files = null;
    }
    if (!isStrictBlogContentPr(pr)) continue;

    try {
      const commit = gh([
        'api',
        `repos/${ghRepo}/commits/${pr.headRefOid}`,
        '--jq',
        '{committedAt: .commit.committer.date}',
      ]);
      pr.candidateCreatedAt = commit.committedAt ?? null;
    } catch {
      pr.candidateCreatedAt = null;
    }

    const run = findBlogQualificationRun(
      [...runs.pull_request, ...runs.merge_group],
      pr
    );
    if (run) {
      try {
        const jobs = gh([
          'api',
          `repos/${ghRepo}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
          '--paginate',
          '--slurp',
          '--jq',
          '[.[].jobs[] | select(.name == "Blog Content Qualification") | {conclusion, startedAt: .started_at, completedAt: .completed_at}]',
        ]);
        const job = jobs.find(candidate => candidate.conclusion === 'success');
        pr.blogQualificationConfirmedAbsent =
          run.conclusion === 'success' &&
          jobs.every(candidate => candidate.conclusion === 'skipped');
        if (job) {
          pr.blogQualification = {
            ...job,
            retries: Math.max(0, Number(run.run_attempt) - 1),
            runnerSeconds:
              (Date.parse(job.completedAt) - Date.parse(job.startedAt)) / 1000,
            buildSeconds: null,
          };
        }
      } catch {
        // Missing evidence stays unknown, including an unreadable job page.
      }
    }

    try {
      const checks = gh([
        'api',
        `repos/${ghRepo}/commits/${pr.mergeCommitSha}/check-runs?per_page=100`,
        '--jq',
        '[.check_runs[] | select(.name == "Production Verified" and .conclusion == "success") | .completed_at]',
      ]);
      pr.productionVerifiedAt = checks.filter(Boolean).toSorted()[0] ?? null;
    } catch {
      pr.productionVerifiedAt = null;
    }
  }

  const deployments = [];
  try {
    const list = gh([
      'api',
      `repos/${ghRepo}/deployments?environment=production&per_page=${DEPLOYMENT_LIMIT}`,
      '--jq',
      '.[] | {id, sha, created_at}',
    ]);
    const deps = Array.isArray(list) ? list : [list];
    for (const dep of deps.filter(Boolean)) {
      try {
        const statuses = gh([
          'api',
          `repos/${ghRepo}/deployments/${dep.id}/statuses?per_page=10`,
          '--jq',
          '.[] | select(.state == "success") | {created_at}',
        ]);
        const arr = Array.isArray(statuses) ? statuses : [statuses];
        const first = arr
          .map(s => s?.created_at)
          .filter(Boolean)
          .sort()[0];
        if (first)
          deployments.push({
            status: 'success',
            createdAt: first,
            sha: dep.sha,
          });
      } catch {
        // skip unreadable deployment
      }
    }
    deployments.sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
    );
  } catch (error) {
    console.error(
      `[shipping-slo] warn: deployment fetch failed: ${error.message}`
    );
  }

  return {
    collectedAt: new Date().toISOString(),
    workflows,
    days,
    runs,
    mergedPrs,
    timelines,
    deployments,
  };
}

/** Raw input → metrics → flat values → evaluation. Pure after collection. */
export function buildReport(raw, baseline, { now = Date.now() } = {}) {
  const nowMs = typeof now === 'number' ? now : Date.parse(now);
  const weekMs = 7 * 86_400_000;
  const sinceMs = nowMs - weekMs;

  const prRuns = [...(raw.runs?.pull_request ?? [])];
  const ci = ciWalltimeByEvent(
    [...prRuns, ...(raw.runs?.merge_group ?? [])],
    sinceMs,
    nowMs
  );
  const merged = raw.mergedPrs ?? [];
  const verifiedSha = new Set(
    (raw.deployments ?? [])
      .filter(d => d.status === 'success' && d.sha)
      .map(d => d.sha)
  );
  const metrics = {
    ci,
    mergeQueue: mergeQueueStats(
      Object.values(raw.timelines ?? {}),
      sinceMs,
      nowMs
    ),
    leadTime: leadTimeByLane(merged, sinceMs, nowMs),
    remediation: remediationStats({
      prRuns,
      mainRuns: raw.runs?.main ?? [],
      promoteHolds: raw.promoteHolds ?? [],
      sinceMs,
      nowMs,
    }),
    productionLag: productionLag(merged, raw.deployments ?? [], sinceMs, nowMs),
    throughput: throughputTrend(merged, nowMs, {
      verifiedPredicate: p =>
        Boolean(p.mergeCommitSha && verifiedSha.has(p.mergeCommitSha)),
    }),
  };
  const blogPublishLatency = buildBlogPublishLatency(raw);

  // Top offenders for regression-issue bodies: slowest PRs by lead time and
  // slowest successful gate runs in the window.
  const leadTimeRows = merged
    .filter(p => p.mergedAt && Date.parse(p.mergedAt) >= sinceMs)
    .map(p => ({
      number: p.number,
      title: p.title,
      lane: prLane(p),
      leadTimeSeconds:
        (Date.parse(p.mergedAt) - Date.parse(p.createdAt)) / 1000,
    }))
    .filter(r => Number.isFinite(r.leadTimeSeconds) && r.leadTimeSeconds > 0)
    .sort((a, b) => b.leadTimeSeconds - a.leadTimeSeconds)
    .slice(0, 5);
  const slowRuns = prRuns
    .filter(r => r.status === 'completed')
    .map(r => ({
      id: r.id,
      head_branch: r.head_branch,
      conclusion: r.conclusion,
      seconds: (Date.parse(r.updated_at) - Date.parse(r.created_at)) / 1000,
    }))
    .filter(r => Number.isFinite(r.seconds) && r.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 5);

  const flat = flattenMetrics(metrics);
  flat.throughput_wow_growth = metrics.throughput.wowGrowth;
  flat.throughput_growth_trend = metrics.throughput.growthTrend;

  const evaluation = evaluateShippingSlo(flat, baseline, {});
  const gistSlo = buildGistSloBlock(flat, evaluation, { now: nowMs });

  return {
    schemaVersion: 1,
    generatedAt: new Date(nowMs).toISOString(),
    windowDays: 7,
    metrics,
    blogPublishLatency,
    flat,
    evaluation: {
      regressions: evaluation.regressions,
      tightenCandidates: evaluation.tightenCandidates,
      flatStall: evaluation.flatStall,
    },
    gistSlo,
    sampled: {
      ciRuns:
        (raw.runs?.pull_request?.length ?? 0) +
        (raw.runs?.merge_group?.length ?? 0) +
        (raw.runs?.main?.length ?? 0),
      mergedPrs: merged.length,
      timelines: Object.keys(raw.timelines ?? {}).length,
      deployments: (raw.deployments ?? []).length,
      blogContentPrs: blogPublishLatency.sampleCount,
    },
    offenders: { slowestPrs: leadTimeRows, slowestCiRuns: slowRuns },
  };
}

function fmtSeconds(s) {
  if (!Number.isFinite(s)) return 'n/a';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m}m${r ? ` ${r}s` : ''}` : `${r}s`;
}

export function markdownSummary(report) {
  const lines = [
    '## Shipping SLO — rolling 7d',
    '',
    '| Metric | p50 | p95 |',
    '| --- | --- | --- |',
  ];
  const rows = [
    ['CI wall time (pull_request)', report.metrics.ci?.pull_request],
    ['CI wall time (merge_group)', report.metrics.ci?.merge_group],
    ['Merge-queue wait', report.metrics.mergeQueue?.wait],
    ['Lead time · devin', report.metrics.leadTime?.devin],
    ['Lead time · codex', report.metrics.leadTime?.codex],
    ['Lead time · other', report.metrics.leadTime?.other],
    ['Remediation · PR red→green', report.metrics.remediation?.prRedToGreen],
    [
      'Remediation · main red→green',
      report.metrics.remediation?.mainRedToGreen,
    ],
    ['Remediation · promote hold', report.metrics.remediation?.promoteHold],
    ['Production lag (merged→verified)', report.metrics.productionLag?.lag],
  ];
  for (const [label, stat] of rows)
    lines.push(
      `| ${label} | ${fmtSeconds(stat?.p50)} | ${fmtSeconds(stat?.p95)} | (n=${stat?.n ?? 0}) |`
    );
  const t = report.metrics.throughput ?? {};
  lines.push(
    '',
    `**Throughput:** ${Number(t.mergesPerDay ?? 0).toFixed(1)} merges/day ` +
      `(verified ${Number(t.verifiedPerDay ?? 0).toFixed(1)}/day) · ` +
      `WoW growth ${t.wowGrowth === null ? 'n/a' : `${(t.wowGrowth * 100).toFixed(1)}%`} ` +
      `(target +8%) · trend ${t.growthTrend ?? 'unknown'}`,
    `**Queue ejection rate:** ${report.metrics.mergeQueue?.ejectionRate === null || report.metrics.mergeQueue?.ejectionRate === undefined ? 'n/a' : (report.metrics.mergeQueue.ejectionRate * 100).toFixed(1) + '%'}`
  );
  const blog = report.blogPublishLatency;
  lines.push(
    '',
    `**Blog publish latency:** legacy n=${blog.cohorts.legacy.sampleCount}, content-only n=${blog.cohorts.contentOnly.sampleCount}; no SLA or improvement claim is emitted without complete samples in both cohorts.`
  );
  const regs = report.evaluation?.regressions ?? [];
  if (regs.length) {
    lines.push('', '### Regressions (>20%)');
    for (const r of regs)
      lines.push(
        `- \`${r.key}\`: baseline ${r.baseline} → observed ${r.observed} (${r.changeFraction === null ? 'n/a' : `${(r.changeFraction * 100).toFixed(0)}%`})`
      );
  }
  if (report.evaluation?.flatStall)
    lines.push(
      '',
      '### Throughput growth stall — WoW growth below +8% target for the flat-growth window; investigate the limiting stage (host pressure, provider concurrency, CI, merge queue, remediation, deploy).'
    );
  const tightened = report.evaluation?.tightenCandidates ?? [];
  if (tightened.length) {
    lines.push('', '### Baseline ratchet candidates (improvement held)');
    for (const c of tightened)
      lines.push(
        `- \`${c.key}\`: ${c.baseline} → ${c.observed} (held ${c.heldDays}d)`
      );
  }
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] && !args[0].startsWith('--') ? args[0] : 'report';

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

  if (command === 'validate') {
    const { ok, errors } = validateBaseline(baseline);
    if (!ok) {
      for (const e of errors) console.error(`[shipping-slo] ✗ ${e}`);
      process.exitCode = 1;
      return;
    }
    console.log('[shipping-slo] ✓ baseline valid');
    return;
  }

  if (command === 'ratchet') {
    // Tighten the baseline from an existing report file (no re-collection).
    const reportPath = argValue(args, '--report', null);
    if (!reportPath) {
      console.error('[shipping-slo] ratchet requires --report <path>');
      process.exitCode = 1;
      return;
    }
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    const { next, tightened } = ratchetBaseline(
      baseline,
      report.flat,
      { tightenCandidates: report.evaluation?.tightenCandidates ?? [] },
      { now: report.generatedAt ?? Date.now() }
    );
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
    console.log(
      tightened.length
        ? `[shipping-slo] baseline tightened: ${tightened.join(', ')}`
        : '[shipping-slo] no held improvements — baseline unchanged'
    );
    return;
  }

  if (command === 'collect') {
    const workflows = String(argValue(args, '--workflows', 'ci.yml'))
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const days = Number(argValue(args, '--days', '21'));
    const raw = collectRaw({ workflows, days });
    const out = argValue(args, '--out', null);
    if (out) writeFileSync(out, JSON.stringify(raw, null, 2));
    else process.stdout.write(JSON.stringify(raw, null, 2));
    return;
  }

  if (command !== 'report') {
    console.error(`[shipping-slo] unknown command: ${command}`);
    process.exitCode = 1;
    return;
  }

  const inputPath = argValue(args, '--input', null);
  const raw = inputPath
    ? JSON.parse(readFileSync(inputPath, 'utf8'))
    : collectRaw({
        workflows: String(argValue(args, '--workflows', 'ci.yml'))
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
        days: Number(argValue(args, '--days', '21')),
      });

  const report = buildReport(raw, baseline, {});

  if (hasArg(args, '--ratchet')) {
    const { next, tightened } = ratchetBaseline(
      baseline,
      report.flat,
      { tightenCandidates: report.evaluation.tightenCandidates },
      { now: report.generatedAt }
    );
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
    report.tightened = tightened;
    console.log(
      tightened.length
        ? `[shipping-slo] baseline tightened: ${tightened.join(', ')}`
        : '[shipping-slo] no held improvements — baseline unchanged'
    );
  }

  if (hasArg(args, '--write-latest')) {
    writeFileSync(LATEST_PATH, `${JSON.stringify(report.gistSlo, null, 2)}\n`);
    writeFileSync(
      BLOG_LATENCY_PATH,
      `${JSON.stringify(report.blogPublishLatency, null, 2)}\n`
    );
  }

  const jsonOut = argValue(args, '--json', null);
  if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);

  console.log(markdownSummary(report));
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main();
