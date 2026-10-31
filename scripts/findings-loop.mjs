#!/usr/bin/env node
// Findings loop: one ledger over every static-analysis source, event-driven
// remediation dispatch, shrink-only ratchets, metrics.
//
//   node scripts/findings-loop.mjs collect  --out ledger.json
//   node scripts/findings-loop.mjs dispatch --ledger ledger.json [--dry-run]
//   node scripts/findings-loop.mjs check    --ledger ledger.json
//   node scripts/findings-loop.mjs publish  --ledger ledger.json [--tighten]
//
// Env: GH_TOKEN (code scanning), ALERTS_TOKEN (Dependabot + secret scanning,
// optional: the source is recorded blind without it), LINEAR_API_KEY,
// GITHUB_REPOSITORY. Secret values are never fetched into the ledger.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGh } from '../packages/api-client/gh.ts';
import { resolveLabelId } from './deprecation-intake.mjs';
import {
  blindEntry,
  computeMetrics,
  fromCodeScanning,
  fromCoverage,
  fromDependabot,
  fromMutation,
  fromSecretScanning,
  fromSonar,
  fromWaste,
  LEDGER_SCHEMA,
  planDispatch,
  publicSafeStats,
  ratchetReport,
  SOURCES,
  sloState,
} from './lib/findings-ledger.mjs';
import {
  closeLinearIssueByFingerprint,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';
import { fileRemediationSignal } from './lib/remediation-signal.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE_PATH = 'docs/metrics/findings-baseline.json';
export const LATEST_PATH = 'docs/metrics/findings-latest.json';
export const PUBLIC_STATS_PATH = 'docs/metrics/findings-public-stats.json';
const SONAR_PROJECT = 'JovieInc_Jovie';
const MAX_ISSUES_PER_RUN = Number(process.env.FINDINGS_DISPATCH_CAP) || 25;
const oldestFirst = (a, b) =>
  Date.parse(a.firstSeen ?? 0) - Date.parse(b.firstSeen ?? 0);

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}
const flag = name => process.argv.includes(name);
const readJson = file =>
  JSON.parse(readFileSync(path.resolve(ROOT, file), 'utf8'));

async function ghJson(args, token) {
  const env = token ? { ...process.env, GH_TOKEN: token } : process.env;
  const r = await runGh(['api', '--paginate', '--slurp', ...args], {
    env,
    priority: 'report',
  });
  if (r.code !== 0) {
    throw Object.assign(
      new Error(
        `gh ${args[0]} exit ${r.code}: ${r.stderr.split('\n')[0].slice(0, 160)}`
      ),
      { exitCode: r.code }
    );
  }
  return JSON.parse(r.stdout).flat();
}

async function sonarJson(pathAndQuery, attempts = 3) {
  for (let i = 1; ; i += 1) {
    try {
      return await sonarOnce(pathAndQuery);
    } catch (error) {
      if (i >= attempts) throw error;
      await new Promise(r => setTimeout(r, 1500 * i));
    }
  }
}

async function sonarOnce(pathAndQuery) {
  const headers = process.env.SONAR_TOKEN
    ? { Authorization: `Bearer ${process.env.SONAR_TOKEN}` }
    : {};
  const res = await fetch(`https://sonarcloud.io/api/${pathAndQuery}`, {
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok)
    throw new Error(
      `sonarcloud ${pathAndQuery.split('?')[0]} HTTP ${res.status}`
    );
  return res.json();
}

async function collectSonar(observedAt) {
  const facets = await sonarJson(
    `issues/search?componentKeys=${SONAR_PROJECT}&resolved=false&ps=1&facets=rules,severities`
  );
  const severityByRule = new Map();
  // One query per severity bucket keeps the rule->severity mapping exact.
  for (const sev of ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR']) {
    const f = await sonarJson(
      `issues/search?componentKeys=${SONAR_PROJECT}&resolved=false&severities=${sev}&ps=1&facets=rules&facetMode=count`
    );
    for (const v of f.facets.find(x => x.property === 'rules')?.values ?? []) {
      severityByRule.set(`${v.val}|${sev}`, v.count);
    }
  }
  const rules = [...severityByRule].map(([k, count]) => {
    const [rule, severity] = k.split('|');
    return { rule, severity, count };
  });
  const gate = (
    await sonarJson(`qualitygates/project_status?projectKey=${SONAR_PROJECT}`)
  ).projectStatus;
  return fromSonar({
    rules,
    gate: { ...gate, observedAt },
    total: facets.total,
  });
}

function latestRun(workflow, repo) {
  return runGh(
    [
      'api',
      `repos/${repo}/actions/workflows/${workflow}/runs?branch=main&status=completed&per_page=5`,
    ],
    { env: process.env, priority: 'report' }
  ).then(r => {
    if (r.code !== 0) throw new Error(`runs ${workflow} exit ${r.code}`);
    const runs = JSON.parse(r.stdout).workflow_runs ?? [];
    return (
      runs.find(
        x => x.conclusion === 'success' || x.conclusion === 'failure'
      ) ?? null
    );
  });
}

export async function collect() {
  const repo = process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
  const observedAt = new Date().toISOString();
  const alertsToken = process.env.ALERTS_TOKEN || process.env.GH_TOKEN;
  const findings = [];
  const sources = {};
  const attempt = async (source, fn) => {
    try {
      const out = await fn();
      findings.push(...out);
      sources[source] = { status: 'ok' };
    } catch (error) {
      if (error.exitCode === 75) throw error; // quota deferral, not blindness
      const reason = String(error.message).slice(0, 160);
      sources[source] = { status: 'blind', reason };
      findings.push(blindEntry(source, reason, observedAt));
    }
  };

  await attempt('code-scanning', async () =>
    fromCodeScanning([
      ...(await ghJson(
        [`repos/${repo}/code-scanning/alerts?state=open&per_page=100`],
        process.env.GH_TOKEN
      )),
      ...(
        await ghJson(
          [`repos/${repo}/code-scanning/alerts?state=fixed&per_page=100`],
          process.env.GH_TOKEN
        )
      ).slice(0, 2000),
    ])
  );
  await attempt('dependabot', async () =>
    fromDependabot([
      ...(await ghJson(
        [`repos/${repo}/dependabot/alerts?state=open&per_page=100`],
        alertsToken
      )),
      ...(await ghJson(
        [`repos/${repo}/dependabot/alerts?state=fixed&per_page=100`],
        alertsToken
      )),
    ])
  );
  await attempt('secret-scanning', async () =>
    fromSecretScanning(
      await ghJson(
        [`repos/${repo}/secret-scanning/alerts?per_page=100`],
        alertsToken
      )
    )
  );
  await attempt(
    'sonarcloud',
    async () => (await collectSonar(observedAt)).entries
  );
  await attempt('coverage', async () =>
    fromCoverage(readJson('apps/web/reports/test-coverage-snapshot.json'))
  );
  await attempt('mutation', async () =>
    fromMutation(await latestRun('mutation-diff.yml', repo))
  );
  // knip: the waste sweep owns measurement and its own ratchet; absent file = not yet measured.
  if (existsSync(path.join(ROOT, 'docs/metrics/waste-latest.json'))) {
    await attempt('knip', async () =>
      fromWaste(readJson('docs/metrics/waste-latest.json'))
    );
  } else {
    sources.knip = {
      status: 'not_measured',
      reason: 'docs/metrics/waste-latest.json not on main yet',
    };
  }

  const metrics = computeMetrics(findings, new Date(observedAt));
  return {
    schema: LEDGER_SCHEMA,
    observedAt,
    repo,
    sources,
    metrics,
    findings,
  };
}

const PRIORITY = { critical: 1, high: 2, medium: 4, low: 4 };

function issueBody(f) {
  const slo = sloState(f);
  return [
    `Source: ${f.source} (${f.tool})${f.rule ? `, rule ${f.rule}` : ''}`,
    `Severity: ${f.severity}${f.count > 1 ? `, ${f.count} occurrences` : ''}`,
    f.file ? `File: ${f.file}${f.line ? `:${f.line}` : ''}` : null,
    `First seen: ${f.firstSeen ?? 'unknown'}; owner: ${f.owner}; SLO due: ${slo.dueAt ?? 'batched tech debt'}`,
    f.url ? `Alert: ${f.url}` : null,
    f.needsTim
      ? '\nSecret leak: rotate through the credentials registry flow (ops/registry/credentials.json). Never paste the secret. Rotation that needs the founder is an Ovie card; revoke first, then re-issue.'
      : '\nFix on a branch, let CI prove it; the loop closes this issue when the finding clears at the source.',
    `\nLedger fingerprint: ${f.fingerprint}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function dispatch(ledger, { dryRun }) {
  const plan = planDispatch(ledger.findings);
  const actions = [];
  const apiKey = process.env.LINEAR_API_KEY;
  if (!dryRun && !apiKey) throw new Error('LINEAR_API_KEY is required');
  const agentReady = dryRun
    ? null
    : await resolveLabelId('agent-ready', apiKey);
  const debt = dryRun ? null : await resolveLabelId('tech-debt', apiKey);
  const run = process.env.GITHUB_RUN_ID
    ? `https://github.com/${ledger.repo}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null;

  for (const f of [...plan.incidents]
    .sort(oldestFirst)
    .slice(0, MAX_ISSUES_PER_RUN)) {
    // Critical: immediate Summer incident (P0 card, agent-ready).
    actions.push({
      fingerprint: f.fingerprint,
      op: 'incident',
      severity: f.severity,
      source: f.source,
    });
    if (dryRun) continue;
    const r = await fileRemediationSignal({
      fingerprint: f.fingerprint,
      source: `findings-loop/${f.source}`,
      runUrl: run,
      detail: issueBody(f),
      apiKey,
    });
    actions.at(-1).ok = r.ok;
    if (!r.ok) process.exitCode = 1;
  }
  for (const f of [...plan.issues]
    .sort(oldestFirst)
    .slice(0, MAX_ISSUES_PER_RUN)) {
    actions.push({
      fingerprint: f.fingerprint,
      op: 'issue',
      severity: f.severity,
      source: f.source,
    });
    if (dryRun) continue;
    const r = await upsertLinearIssueByTitleFingerprint({
      fingerprint: f.fingerprint,
      title:
        `${f.severity.toUpperCase()} ${f.source}: ${f.title} [${f.fingerprint}]`.slice(
          0,
          240
        ),
      description: issueBody(f),
      priority: PRIORITY[f.severity],
      createStateName: 'Todo',
      createLabelIds: agentReady ? [agentReady] : [],
      reopenTerminal: true,
      apiKey,
    });
    actions.at(-1).ok = r.ok;
    if (!r.ok) process.exitCode = 1;
  }
  for (const b of plan.batches) {
    actions.push({
      fingerprint: b.fingerprint,
      op: 'batch',
      total: b.total,
      source: b.source,
    });
    if (dryRun) continue;
    const top = b.items
      .sort((x, y) => y.count - x.count)
      .slice(0, 15)
      .map(
        i =>
          `- ${i.severity} x${i.count}: ${i.title}${i.file ? ` (${i.file})` : ''}`
      )
      .join('\n');
    const r = await upsertLinearIssueByTitleFingerprint({
      fingerprint: b.fingerprint,
      title: `Tech debt: ${b.total} open ${b.source}/${b.tool} findings [${b.fingerprint}]`,
      description: `Batched for the WSJF tech-debt portfolio (no per-finding SLO below high).\n\n${top}\n\nBy severity: ${JSON.stringify(b.bySeverity)}`,
      priority: 4,
      createStateName: 'Backlog',
      createLabelIds: debt ? [debt] : [],
      reopenTerminal: false,
      apiKey,
    });
    actions.at(-1).ok = r.ok;
  }
  if (!dryRun) {
    for (const fingerprint of plan.closes.slice(0, MAX_ISSUES_PER_RUN)) {
      const r = await closeLinearIssueByFingerprint({
        fingerprint,
        runId: process.env.GITHUB_RUN_ID || ledger.observedAt,
        comment: 'The source reports this finding fixed or dismissed.',
        apiKey,
      });
      if (r.ok) actions.push({ fingerprint, op: 'close', ok: true });
    }
  }
  return actions;
}

export function check(ledger) {
  const baseline = readJson(BASELINE_PATH);
  const results = ratchetReport(ledger.metrics, baseline);
  // Blind sources are not clean: ratchet their last known total, do not read as zero.
  return results.filter(r => ledger.sources[r.source]?.status === 'ok');
}

function writeBaseline(ledger, existing) {
  const ratchets = { ...(existing?.ratchets ?? {}) };
  for (const source of SOURCES) {
    if (ledger.sources[source]?.status !== 'ok') continue;
    const measured = ledger.metrics.openBySource[source] ?? 0;
    const prior = ratchets[source]?.baseline;
    // Shrink-only: a baseline is never raised here.
    if (prior !== undefined && measured >= prior) continue;
    ratchets[source] = {
      schemaVersion: 1,
      dimension: `open-findings-${source}`,
      direction: 'lock_down',
      baseline: measured,
    };
  }
  return {
    schema: 'jovie.findings-baseline/v1',
    note: 'Open findings per source (occurrence counts). lock_down via ratchet-core: new findings may not raise a count; the loop lowers improved counts. Never raise a baseline: fix the finding.',
    updatedAt: ledger.observedAt,
    ratchets,
  };
}

export function publish(ledger, { tighten }) {
  const sources = Object.fromEntries(Object.entries(ledger.sources));
  const latest = {
    schema: 'jovie.findings-latest/v1',
    observedAt: ledger.observedAt,
    sources,
    ...ledger.metrics,
    blindSources: Object.entries(sources)
      .filter(([, s]) => s.status === 'blind')
      .map(([k]) => k),
  };
  writeFileSync(
    path.join(ROOT, LATEST_PATH),
    `${JSON.stringify(latest, null, 2)}\n`
  );
  writeFileSync(
    path.join(ROOT, PUBLIC_STATS_PATH),
    `${JSON.stringify({ schema: 'jovie.findings-public-stats/v1', observedAt: ledger.observedAt, ...publicSafeStats(ledger.metrics) }, null, 2)}\n`
  );
  const existing = existsSync(path.join(ROOT, BASELINE_PATH))
    ? readJson(BASELINE_PATH)
    : null;
  if (tighten || !existing) {
    writeFileSync(
      path.join(ROOT, BASELINE_PATH),
      `${JSON.stringify(writeBaseline(ledger, existing), null, 2)}\n`
    );
  }
  return latest;
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'collect') {
    const ledger = await collect();
    writeFileSync(
      arg('--out') || 'findings-ledger.json',
      JSON.stringify(ledger, null, 2)
    );
    console.log(
      JSON.stringify({
        sources: ledger.sources,
        ...ledger.metrics,
        sloBreachList: undefined,
      })
    );
    return;
  }
  const ledger = JSON.parse(
    readFileSync(arg('--ledger') || 'findings-ledger.json', 'utf8')
  );
  if (mode === 'dispatch') {
    const actions = await dispatch(ledger, { dryRun: flag('--dry-run') });
    console.log(
      JSON.stringify({
        dispatched: actions.length,
        actions: actions.slice(0, 20),
      })
    );
  } else if (mode === 'check') {
    const results = check(ledger);
    for (const r of results) {
      const line = `${r.source}: ${r.measured} open vs baseline ${r.baseline} (${r.status})`;
      if (!r.ok) console.error(`::error::Findings ratchet regression: ${line}`);
      else console.log(line);
    }
    for (const [name, s] of Object.entries(ledger.sources)) {
      if (s.status === 'blind')
        console.log(`::warning::${name} is blind: ${s.reason}`);
    }
    if (results.some(r => !r.ok)) process.exitCode = 1;
  } else if (mode === 'publish') {
    publish(ledger, { tighten: flag('--tighten') });
  } else {
    console.error('usage: findings-loop.mjs collect|dispatch|check|publish');
    process.exitCode = 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = error.exitCode ?? 1;
  });
}
