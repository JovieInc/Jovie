#!/usr/bin/env node

import { appendFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const CONTINUITY_SCHEMA = 'jovie-production-continuity/v1';
export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_TARGETS = Object.freeze([
  {
    id: 'jovie-production',
    url: 'https://jov.ie/api/health/build-info',
  },
  {
    id: 'summer-production',
    url: 'https://summer.jov.ie/api/health',
  },
]);

const exactMoney = value =>
  Number.isFinite(value) && value >= 0 ? Number(value) : null;

const boundedText = value =>
  typeof value === 'string' && value.trim()
    ? value.trim().replaceAll(/\s+/g, ' ').slice(0, 160)
    : null;

const normalizedHeader = (headers, name) => {
  if (headers?.get instanceof Function) return boundedText(headers.get(name));
  if (!headers || typeof headers !== 'object') return null;
  const pair = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase()
  );
  return boundedText(pair?.[1]);
};

export function classifyEndpointObservation({
  body = '',
  error = null,
  id,
  status = null,
  url,
  headers = {},
} = {}) {
  const target = boundedText(id);
  const endpoint = boundedText(url);
  const providerError = normalizedHeader(headers, 'x-vercel-error');
  const excerpt = boundedText(body);
  const networkError = boundedText(error);

  if (!target || !endpoint) {
    throw new Error('continuity observation requires a target id and URL');
  }

  if (
    providerError === 'DEPLOYMENT_PAUSED' ||
    excerpt?.includes('DEPLOYMENT_PAUSED')
  ) {
    return {
      id: target,
      url: endpoint,
      healthy: false,
      incidentClass: 'deployment-paused',
      reason: 'vercel-deployment-paused',
      status,
      providerError: 'DEPLOYMENT_PAUSED',
    };
  }
  if (status === 402) {
    return {
      id: target,
      url: endpoint,
      healthy: false,
      incidentClass: 'provider-quota-exhausted',
      reason: 'http-402',
      status,
      providerError,
    };
  }
  if (status === 200) {
    return {
      id: target,
      url: endpoint,
      healthy: true,
      incidentClass: null,
      reason: 'http-200',
      status,
      providerError,
    };
  }
  if (networkError) {
    return {
      id: target,
      url: endpoint,
      healthy: false,
      incidentClass: 'observer-unavailable',
      reason: networkError,
      status: null,
      providerError: null,
    };
  }
  return {
    id: target,
    url: endpoint,
    healthy: false,
    incidentClass:
      Number.isInteger(status) && status >= 500
        ? 'runtime-unavailable'
        : 'unexpected-response',
    reason: Number.isInteger(status) ? `http-${status}` : 'missing-http-status',
    status,
    providerError,
  };
}

export function aggregateContinuity(observations, { now = new Date() } = {}) {
  if (!Array.isArray(observations) || observations.length === 0) {
    throw new Error('continuity aggregation requires at least one observation');
  }
  const unhealthy = observations.filter(item => item.healthy !== true);
  return {
    schema: CONTINUITY_SCHEMA,
    observedAt: new Date(now).toISOString(),
    status: unhealthy.length === 0 ? 'healthy' : 'unhealthy',
    targets: observations,
    affectedTargets: unhealthy.map(item => item.id),
    incidentClasses: [...new Set(unhealthy.map(item => item.incidentClass))],
    requiresFounderNotification: unhealthy.length > 0,
    requiresAgentIngress: unhealthy.length > 0,
  };
}

export function forecastBudgetExhaustion({
  budgetAmountUsd,
  currentSpendUsd,
  forecastHorizonMinutes,
  maximumSnapshotAgeMinutes,
  now = new Date(),
  observedAt,
  priorObservedAt,
  priorSpendUsd,
} = {}) {
  const budget = exactMoney(budgetAmountUsd);
  const current = exactMoney(currentSpendUsd);
  const prior = exactMoney(priorSpendUsd);
  const horizon = exactMoney(forecastHorizonMinutes);
  const maximumAge = exactMoney(maximumSnapshotAgeMinutes);
  const observed = Date.parse(observedAt);
  const priorObserved = Date.parse(priorObservedAt);
  const currentTime = new Date(now).getTime();
  if (
    budget == null ||
    current == null ||
    prior == null ||
    !horizon ||
    !maximumAge ||
    !Number.isFinite(observed) ||
    !Number.isFinite(priorObserved) ||
    !Number.isFinite(currentTime) ||
    priorObserved >= observed
  ) {
    throw new Error(
      'budget forecast requires ordered, bounded spend snapshots'
    );
  }
  const ageMinutes = (currentTime - observed) / 60_000;
  if (ageMinutes < 0 || ageMinutes > maximumAge) {
    return { status: 'unknown', reason: 'stale-or-future-spend-snapshot' };
  }
  if (current < prior) {
    return { status: 'unknown', reason: 'budget-cycle-reset-or-meter-drift' };
  }
  if (current >= budget) {
    return {
      status: 'exhausted',
      reason: 'budget-reached',
      minutesRemaining: 0,
    };
  }
  const ratePerMinute =
    (current - prior) / ((observed - priorObserved) / 60_000);
  if (ratePerMinute === 0) {
    return {
      status: 'stable',
      reason: 'no-observed-spend-growth',
      minutesRemaining: null,
    };
  }
  const minutesRemaining = (budget - current) / ratePerMinute;
  return {
    status: minutesRemaining <= horizon ? 'at-risk' : 'within-budget',
    reason:
      minutesRemaining <= horizon
        ? 'forecast-horizon-breached'
        : 'headroom-observed',
    minutesRemaining,
    ratePerMinute,
  };
}

export async function observeTarget(
  target,
  { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(target.url, {
      headers: {
        Accept: 'application/json, text/plain;q=0.9',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
      redirect: 'manual',
      signal: controller.signal,
    });
    const body = await response.text();
    return classifyEndpointObservation({
      body,
      headers: response.headers,
      id: target.id,
      status: response.status,
      url: target.url,
    });
  } catch (error) {
    return classifyEndpointObservation({
      error: controller.signal.aborted
        ? `timeout-after-${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error),
      id: target.id,
      url: target.url,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function observeProductionContinuity({
  fetchImpl = fetch,
  now = new Date(),
  targets = DEFAULT_TARGETS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const observations = await Promise.all(
    targets.map(target => observeTarget(target, { fetchImpl, timeoutMs }))
  );
  return aggregateContinuity(observations, { now });
}

export function continuityIncidentKey(result) {
  if (result?.schema !== CONTINUITY_SCHEMA) {
    throw new Error(
      'continuity incident key requires a valid continuity result'
    );
  }
  if (result.status === 'healthy') return 'production-continuity:healthy';
  return `production-continuity:${result.affectedTargets.join(',')}:${result.incidentClasses.join(',')}`;
}

export function planBudgetContinuityAction({
  acknowledgedByFounder = false,
  ackWindowExpired = false,
  approvedEmergencyCeilingUsd = null,
  budgetAmountUsd,
  currentSpendUsd,
  incidentKey,
  maximumStageIncreaseUsd = null,
  minimumHeadroomUsd = null,
  productionAtRisk = false,
  spendRateContained = false,
  stageAlreadyApplied = false,
  thresholdPercent,
} = {}) {
  const budget = exactMoney(budgetAmountUsd);
  const spend = exactMoney(currentSpendUsd);
  const threshold = exactMoney(thresholdPercent);
  const ceiling = exactMoney(approvedEmergencyCeilingUsd);
  const maximumStage = exactMoney(maximumStageIncreaseUsd);
  const minimumHeadroom = exactMoney(minimumHeadroomUsd);
  const key = boundedText(incidentKey);
  if (budget == null || spend == null || threshold == null || !key) {
    throw new Error(
      'budget continuity planning requires an incident key and fresh non-negative spend evidence'
    );
  }

  const base = {
    schema: CONTINUITY_SCHEMA,
    incidentKey: key,
    founderAction:
      threshold >= 75 || productionAtRisk ? 'notify-now' : 'notify',
    agentAction:
      threshold >= 75 || productionAtRisk
        ? 'investigate-spend-source'
        : 'observe',
    budgetMutationAuthorized: false,
    resumeAuthorized: false,
    proposedBudgetUsd: null,
    reason: 'founder-primary',
  };

  if (threshold < 100 && !productionAtRisk) return base;
  if (acknowledgedByFounder) {
    return {
      ...base,
      agentAction: 'support-founder',
      reason: 'founder-acknowledged',
    };
  }
  if (!ackWindowExpired) {
    return {
      ...base,
      agentAction: 'contain-and-wait',
      reason: 'founder-ack-window-open',
    };
  }
  if (stageAlreadyApplied) {
    return {
      ...base,
      agentAction: 'verify-existing-stage',
      reason: 'stage-idempotency-hold',
    };
  }
  if (ceiling == null || maximumStage == null || minimumHeadroom == null) {
    return {
      ...base,
      agentAction: 'escalate-missing-financial-authority',
      reason: 'emergency-budget-policy-unconfigured',
    };
  }
  if (!spendRateContained) {
    return {
      ...base,
      agentAction: 'contain-spend-before-budget-change',
      reason: 'spend-source-not-contained',
    };
  }

  const requiredBudget = Math.ceil(spend + minimumHeadroom);
  const stageCeiling = Math.min(ceiling, budget + maximumStage);
  if (requiredBudget > stageCeiling) {
    return {
      ...base,
      agentAction: 'escalate-stage-insufficient',
      reason: 'approved-stage-cannot-create-required-headroom',
    };
  }
  return {
    ...base,
    agentAction: 'stage-budget-then-resume-affected-projects',
    budgetMutationAuthorized: true,
    resumeAuthorized: true,
    proposedBudgetUsd: requiredBudget,
    reason: 'bounded-emergency-stage-authorized',
    verification: [
      'confirm-provider-budget-readback',
      'resume-each-affected-project',
      'probe-each-production-endpoint-twice',
      'record-spend-and-runtime-receipts',
    ],
  };
}

export function parseCliArgs(argv) {
  const args = { targets: [], output: null, githubOutput: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--target' && value) {
      args.targets.push(value);
      index += 1;
    } else if (flag === '--output' && value) {
      args.output = value;
      index += 1;
    } else if (flag === '--github-output' && value) {
      args.githubOutput = value;
      index += 1;
    } else {
      throw new Error(`unsupported production continuity argument: ${flag}`);
    }
  }
  return args;
}

export async function runCli({
  appendFileImpl = appendFile,
  argv = process.argv.slice(2),
  fetchImpl = fetch,
  now = new Date(),
  stdout = process.stdout,
  writeFileImpl = writeFile,
} = {}) {
  const args = parseCliArgs(argv);
  const result = await observeProductionContinuity({
    fetchImpl,
    now,
    targets: parseTargets(args.targets),
  });
  const incidentKey = continuityIncidentKey(result);
  const serialized = `${JSON.stringify({ ...result, incidentKey })}\n`;
  if (args.output) await writeFileImpl(args.output, serialized, 'utf8');
  if (args.githubOutput) {
    await appendFileImpl(
      args.githubOutput,
      [
        `status=${result.status}`,
        `affected_targets=${result.affectedTargets.join(',')}`,
        `incident_classes=${result.incidentClasses.join(',')}`,
        `incident_key=${incidentKey}`,
      ].join('\n') + '\n',
      'utf8'
    );
  }
  stdout.write(serialized);
  return { ...result, incidentKey };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli().catch(error => {
    process.stderr.write(
      `production-continuity: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  });
}

export function parseTargets(values) {
  if (values.length === 0) return DEFAULT_TARGETS;
  return values.map(value => {
    const separator = value.indexOf('=');
    if (separator <= 0)
      throw new Error('--target must be formatted id=https://url');
    const id = value.slice(0, separator);
    const url = value.slice(separator + 1);
    if (!URL.canParse(url) || new URL(url).protocol !== 'https:') {
      throw new Error('continuity targets must use HTTPS');
    }
    return { id, url };
  });
}
