#!/usr/bin/env node
// Hard spend cap for Vercel on-demand build concurrency on the jovie project.
// EVENT 2026-10-20 (Tim): on-demand for jovie prod/staging, fixed Standard
// machine, hard cap $10/month with the cutoff at $8 and an alert at $5.
//
// Vercel Spend Management cannot do this: its only hard stop pauses
// production for every project on the team. On-demand cost accrues only when
// a jovie deployment builds, and every staging/production deploy runs this
// ledger first, so it is a real stop: at most one build lands past the cutoff.
// It is the only writer of the project's elasticConcurrencyEnabled flag.
// Unknown spend disables on-demand (fail closed for cost) and never fails a
// release: a disabled flag only means the normal build queue.
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const API_BASE = 'https://api.vercel.com';
const DAY_MS = 86_400_000;
const BUILD_SERVICES = new Set(['Build CPU Minutes', 'Build Minutes']);

export function loadPolicy(
  path = new URL('../vercel-on-demand-policy.json', import.meta.url)
) {
  const policy = JSON.parse(readFileSync(path, 'utf8'));
  if (
    policy.schema !== 'jovie-vercel-on-demand-policy/v1' ||
    !(policy.cutoffUsd < policy.hardCapUsd) ||
    !(policy.alertUsd < policy.cutoffUsd) ||
    policy.buildMachineType !== 'standard' ||
    policy.buildMachineSelection !== 'fixed' ||
    !(policy.vcpu > 0 && policy.usdPerCpuMinute > 0)
  ) {
    throw new Error('invalid on-demand policy');
  }
  return policy;
}

/** Billed cost of one build: Vercel rounds up to whole minutes x vCPU. */
export function buildCostUsd(deployment, policy, now = Date.now()) {
  const start = Number(deployment?.buildingAt);
  if (!Number.isFinite(start) || start <= 0) return 0;
  const ready = Number(deployment?.ready);
  const end = Number.isFinite(ready) && ready >= start ? ready : now;
  const minutes = Math.max(1, Math.ceil((end - start) / 60_000));
  return minutes * policy.vcpu * policy.usdPerCpuMinute;
}

/**
 * Spend since the later of the billing-period start and on-demand enablement:
 * the larger of our per-build estimate and Vercel's billed build charges, plus
 * a projection to period end from the recent daily rate (window >= 1 day so a
 * burst right after enablement cannot extrapolate wildly).
 */
export function computeLedger({
  deployments,
  charges = [],
  policy,
  period,
  now = Date.now(),
}) {
  const since = Math.max(period.start, Date.parse(policy.enabledAt));
  const counted = deployments.filter(
    d =>
      d?.projectId === policy.projectId &&
      Number(d?.buildingAt) >= since &&
      Number(d?.buildingAt) <= now
  );
  const estimatedUsd = counted.reduce(
    (sum, d) => sum + buildCostUsd(d, policy, now),
    0
  );
  const billedUsd = charges
    .filter(
      row =>
        BUILD_SERVICES.has(row?.ServiceName) &&
        row?.Tags?.ProjectId === policy.projectId &&
        Date.parse(row?.ChargePeriodEnd) > since
    )
    .reduce((sum, row) => sum + (Number(row.BilledCost) || 0), 0);
  const actualUsd = Math.max(estimatedUsd, billedUsd);
  const windowStart = Math.max(
    since,
    now - policy.projectionWindowDays * DAY_MS
  );
  const windowDays = Math.max(1, (now - windowStart) / DAY_MS);
  const windowUsd = counted
    .filter(d => Number(d.buildingAt) >= windowStart)
    .reduce((sum, d) => sum + buildCostUsd(d, policy, now), 0);
  const remainingDays = Math.max(0, (period.end - now) / DAY_MS);
  const projectedUsd = actualUsd + (windowUsd / windowDays) * remainingDays;
  const round = n => Math.round(n * 1000) / 1000;
  return {
    builds: counted.length,
    estimatedUsd: round(estimatedUsd),
    billedUsd: round(billedUsd),
    actualUsd: round(actualUsd),
    projectedUsd: round(projectedUsd),
  };
}

/** Desired on-demand state. Cutoff on actual OR projected spend. */
export function decide({ ledger, policy, project }) {
  const rc = project?.resourceConfig ?? {};
  const alert =
    ledger !== null &&
    (ledger.actualUsd >= policy.alertUsd ||
      ledger.projectedUsd >= policy.alertUsd);
  const off = reason => ({ enabled: false, reason, alert });
  if (!policy.enabled) return off('policy-disabled');
  if (
    rc.buildMachineType !== policy.buildMachineType ||
    rc.buildMachineSelection !== policy.buildMachineSelection
  ) {
    return off('build-machine-not-pinned-standard');
  }
  if (ledger === null) return off('spend-unknown');
  if (ledger.actualUsd >= policy.cutoffUsd) return off('cutoff-actual');
  if (ledger.projectedUsd >= policy.cutoffUsd) return off('cutoff-projected');
  return { enabled: true, reason: 'within-cap', alert };
}

async function vercel(path, { token, teamId, fetchImpl, method, body, text }) {
  const url = new URL(path, API_BASE);
  url.searchParams.set('teamId', teamId);
  const response = await fetchImpl(url, {
    method: method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Vercel API ${response.status} ${path}`);
  return text ? response.text() : response.json();
}

async function listProjectDeployments(ctx, projectId, since) {
  const rows = [];
  let until = '';
  for (let page = 0; page < 20; page++) {
    const result = await vercel(
      `/v6/deployments?projectId=${projectId}&since=${since}&limit=100${until ? `&until=${until}` : ''}`,
      ctx
    );
    rows.push(...(result.deployments ?? []));
    const next = result.pagination?.next;
    if (!next || (result.deployments ?? []).length === 0) return rows;
    until = next;
  }
  throw new Error('deployment listing exceeded 20 pages');
}

export async function runLedger({
  token,
  teamId,
  policy,
  fetchImpl = fetch,
  now = Date.now(),
}) {
  const ctx = { token, teamId, fetchImpl };
  const project = await vercel(`/v9/projects/${policy.projectId}`, ctx);
  let ledger = null;
  let error = null;
  try {
    const team = await vercel(`/v2/teams/${teamId}`, ctx);
    const period = team?.billing?.period;
    if (!(period?.start > 0 && period?.end > period.start)) {
      throw new Error('billing period unavailable');
    }
    const since = Math.max(period.start, Date.parse(policy.enabledAt));
    const deployments = await listProjectDeployments(
      ctx,
      policy.projectId,
      since
    );
    const jsonl = await vercel(
      `/v1/billing/charges?from=${new Date(since).toISOString()}&to=${new Date(now).toISOString()}`,
      { ...ctx, text: true }
    );
    const charges = jsonl
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    ledger = computeLedger({ deployments, charges, policy, period, now });
  } catch (cause) {
    error = cause.message;
  }
  const decision = decide({ ledger, policy, project });
  const current = project?.resourceConfig?.elasticConcurrencyEnabled === true;
  let changed = false;
  if (current !== decision.enabled) {
    await vercel(`/v9/projects/${policy.projectId}`, {
      ...ctx,
      method: 'PATCH',
      body: {
        resourceConfig: decision.enabled
          ? {
              elasticConcurrencyEnabled: true,
              buildQueue: { configuration: policy.buildQueueConfiguration },
            }
          : { elasticConcurrencyEnabled: false },
      },
    });
    const readBack = await vercel(`/v9/projects/${policy.projectId}`, ctx);
    if (
      (readBack?.resourceConfig?.elasticConcurrencyEnabled === true) !==
      decision.enabled
    ) {
      throw new Error('on-demand flag did not read back as written');
    }
    changed = true;
  }
  return { ledger, decision, previous: current, changed, error };
}

export function renderLedger(result, policy) {
  const { ledger, decision } = result;
  const usd = n => `$${n.toFixed(2)}`;
  const lines = [
    '### Vercel on-demand build cap (jovie)',
    '',
    `On-demand: **${decision.enabled ? 'enabled' : 'disabled'}** (${decision.reason})${result.changed ? `, changed from ${result.previous ? 'enabled' : 'disabled'}` : ''}.`,
  ];
  if (ledger) {
    lines.push(
      `Spend this period: ${usd(ledger.actualUsd)} actual (estimate ${usd(ledger.estimatedUsd)} over ${ledger.builds} builds, billed ${usd(ledger.billedUsd)}), ${usd(ledger.projectedUsd)} projected. Alert ${usd(policy.alertUsd)}, cutoff ${usd(policy.cutoffUsd)}, hard cap ${usd(policy.hardCapUsd)}.`
    );
  }
  if (result.error) lines.push(`Spend unknown: ${result.error}.`);
  return `${lines.join('\n')}\n`;
}

export async function runCli({ env = process.env, fetchImpl = fetch } = {}) {
  let policy;
  try {
    policy = loadPolicy();
    if (!env.VERCEL_TOKEN || !env.VERCEL_ORG_ID) {
      throw new Error('VERCEL_TOKEN and VERCEL_ORG_ID are required');
    }
    const result = await runLedger({
      token: env.VERCEL_TOKEN,
      teamId: env.VERCEL_ORG_ID,
      policy,
      fetchImpl,
    });
    const report = renderLedger(result, policy);
    console.log(report);
    if (env.GITHUB_STEP_SUMMARY)
      appendFileSync(env.GITHUB_STEP_SUMMARY, report);
    if (result.decision.alert) {
      console.log(
        `::warning::Vercel on-demand spend for jovie reached the $${policy.alertUsd} alert (actual $${result.ledger?.actualUsd}, projected $${result.ledger?.projectedUsd}; cutoff $${policy.cutoffUsd}).`
      );
    }
    if (
      !result.decision.enabled &&
      result.decision.reason !== 'policy-disabled'
    ) {
      console.log(
        `::warning::Vercel on-demand builds for jovie are off (${result.decision.reason}); staging/production use the normal build queue.`
      );
    }
    return result;
  } catch (error) {
    console.log(
      `::warning::Vercel on-demand ledger failed (${error.message}); release continues on the current queue setting.`
    );
    return null;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli();
}
