#!/usr/bin/env node
/**
 * Executable installed-Mac performance contract (JOV-7463).
 *
 * Budgets come from the Mac daily-driver charter. Evaluation rejects regressions
 * when measurements are present. Missing live evidence never passes LIVE_CERT.
 */
import os from 'node:os';

/** Charter budgets: Apple Silicon release builds, p95 interaction latency. */
export const PERFORMANCE_CONTRACT = Object.freeze({
  schema: 'jovie-desktop-performance-contract/v1',
  source: 'docs/mac-daily-driver-hardening.md executable performance contract',
  issue: 'JOV-7463',
  budgets: Object.freeze({
    warmLaunchMs: Object.freeze({
      limit: 500,
      unit: 'ms',
      comparison: 'lte',
      description: 'Warm launch to usable UI',
    }),
    cachedNavigationMs: Object.freeze({
      limit: 100,
      unit: 'ms',
      comparison: 'lte',
      description: 'Cached page navigation',
    }),
    coldLaunchToUsableMs: Object.freeze({
      limit: 1500,
      unit: 'ms',
      comparison: 'lte',
      description: 'Cold launch to usable UI',
    }),
    typingLatencyMs: Object.freeze({
      limit: 16,
      unit: 'ms',
      comparison: 'lte',
      description: 'Typing latency (p95)',
    }),
    commandPaletteMs: Object.freeze({
      limit: 50,
      unit: 'ms',
      comparison: 'lte',
      description: 'Command palette open (p95)',
    }),
    idleCpuPercent: Object.freeze({
      limit: 1,
      unit: '% of one logical CPU',
      comparison: 'lte',
      description: 'Idle CPU average',
    }),
    unintendedLayoutShifts: Object.freeze({
      limit: 0,
      unit: 'count',
      comparison: 'eq',
      description: 'Unintended layout shifts',
    }),
    lostDrafts: Object.freeze({
      limit: 0,
      unit: 'count',
      comparison: 'eq',
      description: 'Lost drafts / interrupted work',
    }),
  }),
});

export const LIVE_CERT_REQUIRED_METRICS = Object.freeze([
  'warmLaunchMs',
  'cachedNavigationMs',
  'coldLaunchToUsableMs',
  'typingLatencyMs',
  'commandPaletteMs',
  'idleCpuPercent',
  'unintendedLayoutShifts',
  'lostDrafts',
]);

export function metricPasses(budget, value) {
  if (!Number.isFinite(value)) return false;
  if (budget.comparison === 'eq') return value === budget.limit;
  return value <= budget.limit;
}

/**
 * Evaluate a measurement map against the charter contract.
 * Missing metrics are incomplete (not a silent pass).
 */
export function evaluatePerformanceContract(measurements = {}) {
  const results = {};
  let regressions = 0;
  let missing = 0;
  for (const [key, budget] of Object.entries(PERFORMANCE_CONTRACT.budgets)) {
    const raw = measurements[key];
    const present =
      raw !== undefined &&
      raw !== null &&
      Number.isFinite(typeof raw === 'number' ? raw : Number(raw));
    if (!present) {
      missing += 1;
      results[key] = {
        status: 'missing',
        value: null,
        limit: budget.limit,
        unit: budget.unit,
        description: budget.description,
        met: false,
      };
      continue;
    }
    const value = typeof raw === 'number' ? raw : Number(raw);
    const met = metricPasses(budget, value);
    if (!met) regressions += 1;
    results[key] = {
      status: met ? 'pass' : 'fail',
      value,
      limit: budget.limit,
      unit: budget.unit,
      description: budget.description,
      met,
    };
  }
  const status =
    regressions > 0 ? 'regression' : missing > 0 ? 'incomplete' : 'certified';
  return {
    schema: 'jovie-desktop-performance-cert/v1',
    contract: PERFORMANCE_CONTRACT.schema,
    issue: PERFORMANCE_CONTRACT.issue,
    status,
    regressions,
    missing,
    results,
  };
}

/** Map a launch-readiness receipt into cold-launch contract input. */
export function measurementsFromLaunchReadiness(receipt) {
  if (receipt?.schema !== 'jovie-desktop-launch-readiness/v1') {
    throw new Error('Expected jovie-desktop-launch-readiness/v1 receipt');
  }
  const cold = receipt.composerVisibleEditableAfterPaintOpportunityMs;
  return {
    coldLaunchToUsableMs: Number.isFinite(cold) ? cold : null,
    nativeBuild: receipt.nativeBuild ?? null,
    pid: receipt.pid ?? null,
  };
}

/**
 * Map a production-baseline report into idle-CPU contract input.
 * Uses the mean of per-sample totalCpuPercent for idle scenarios only.
 */
export function measurementsFromProductionBaseline(report) {
  if (report?.schema !== 'jovie-desktop-production-baseline/v1') {
    throw new Error('Expected jovie-desktop-production-baseline/v1 report');
  }
  if (!report.scenario?.endsWith('-idle')) {
    throw new Error(
      'Idle CPU certification requires an idle production-baseline scenario'
    );
  }
  if (report.status !== 'baseline-captured' || !report.samples?.length) {
    return {
      idleCpuPercent: null,
      nativeBuild: report.nativeBuild ?? null,
      scenario: report.scenario,
    };
  }
  const sum = report.samples.reduce(
    (total, sample) => total + sample.totalCpuPercent,
    0
  );
  return {
    idleCpuPercent: sum / report.samples.length,
    nativeBuild: report.nativeBuild ?? null,
    scenario: report.scenario,
  };
}

export function mergeMeasurements(...parts) {
  const merged = {};
  for (const part of parts) {
    if (!part) continue;
    for (const [key, value] of Object.entries(part)) {
      if (
        key === 'nativeBuild' ||
        key === 'pid' ||
        key === 'scenario' ||
        value === undefined
      )
        continue;
      if (value === null && merged[key] !== undefined) continue;
      merged[key] = value;
    }
  }
  return merged;
}

export function liveCertGate({ platform = process.platform, evaluation }) {
  if (platform !== 'darwin') {
    return {
      liveCert: 'blocked',
      reason:
        'LIVE_CERT blocked: installed-Mac session required (no macOS runner in this environment)',
      evaluationStatus: evaluation.status,
    };
  }
  if (evaluation.status === 'certified') {
    return {
      liveCert: 'pass',
      reason: 'All charter metrics measured and within budget',
      evaluationStatus: evaluation.status,
    };
  }
  if (evaluation.status === 'regression') {
    return {
      liveCert: 'fail',
      reason: 'One or more charter metrics exceeded budget',
      evaluationStatus: evaluation.status,
    };
  }
  return {
    liveCert: 'blocked',
    reason:
      'LIVE_CERT blocked: incomplete measurements on Mac (missing charter metrics)',
    evaluationStatus: evaluation.status,
  };
}

export function renderCertSummary(report) {
  const rows = Object.entries(report.evaluation.results)
    .map(
      ([key, row]) =>
        `| ${key} | ${row.status} | ${row.value ?? '—'} | ${row.limit} ${row.unit} | ${row.description} |`
    )
    .join('\n');
  return `# Installed Mac performance certification (JOV-7463)

Status: **${report.evaluation.status}**
LIVE_CERT: **${report.gate.liveCert}**

${report.gate.reason}

Contract: \`${report.contract.schema}\` — ${report.contract.source}

| Metric | Status | Value | Budget | Description |
| --- | --- | ---: | --- | --- |
${rows}

Mode: ${report.mode}. Platform: ${report.host.platform}/${report.host.architecture}.
${report.identity ? `Native identity: ${report.identity.version ?? 'unknown'} / ${report.identity.sourceRevision ?? 'unknown'} (${report.identity.channel ?? 'unknown'}).\n` : ''}
Missing metrics never pass LIVE_CERT. Over-budget metrics fail closed.
`;
}

export function buildCertReport({
  mode,
  measurements,
  identity = null,
  platform = process.platform,
  arch = process.arch,
  now = () => new Date().toISOString(),
}) {
  const evaluation = evaluatePerformanceContract(measurements);
  const gate = liveCertGate({ platform, evaluation });
  return {
    schema: 'jovie-desktop-performance-cert-report/v1',
    issue: 'JOV-7463',
    mode,
    generatedAt: now(),
    host: { platform, architecture: arch, release: os.release() },
    identity,
    contract: {
      schema: PERFORMANCE_CONTRACT.schema,
      source: PERFORMANCE_CONTRACT.source,
      budgets: PERFORMANCE_CONTRACT.budgets,
    },
    measurements,
    evaluation,
    gate,
  };
}

export function exitCodeForReport(report) {
  if (report.mode === 'contract-check') return 0;
  if (
    report.gate.liveCert === 'fail' ||
    report.evaluation.status === 'regression'
  )
    return 1;
  if (report.mode === 'live' && report.gate.liveCert !== 'pass') return 1;
  if (report.mode === 'evaluate' && report.evaluation.status === 'regression')
    return 1;
  return 0;
}
