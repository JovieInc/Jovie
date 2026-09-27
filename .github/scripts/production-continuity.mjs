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
    url: 'https://summer.jov.ie/runtime/v1/health',
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
    // A stale production is a release-pipeline failure, not a provider
    // outage: it pages the founder but never admits a provider-recovery task.
    requiresAgentIngress: unhealthy.some(
      item => item.incidentClass !== FRESHNESS_INCIDENT_CLASS
    ),
  };
}

export const FRESHNESS_TARGET_ID = 'jovie-production-freshness';
export const FRESHNESS_INCIDENT_CLASS = 'production-stale';
// Twice the controller's own starvation bound (release-lineage-gate.sh), so
// this only fires once the in-band guard has already failed to ship.
export const DEFAULT_STALE_AFTER_SECONDS = 7200;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

/**
 * Production freshness: how long has main carried commits that production
 * lacks? Reads the live SHA from build-info and the unshipped range from the
 * GitHub compare API. Fails open (healthy with a reason) when either source is
 * unreadable so a GitHub hiccup never pages; runtime outages are already
 * reported by the jovie-production target.
 */
export async function observeProductionFreshness({
  buildInfoUrl = DEFAULT_TARGETS[0].url,
  fetchImpl = fetch,
  githubApiUrl = 'https://api.github.com',
  now = new Date(),
  repository,
  staleAfterSeconds = DEFAULT_STALE_AFTER_SECONDS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  token = '',
} = {}) {
  const base = {
    id: FRESHNESS_TARGET_ID,
    url: buildInfoUrl,
    healthy: true,
    incidentClass: null,
    status: null,
    providerError: null,
    liveSha: null,
    mainSha: null,
    unshippedCommits: 0,
    oldestUnshippedAt: null,
    unshippedAgeSeconds: 0,
  };
  if (!/^[^/]+\/[^/]+$/.test(repository ?? '')) {
    return { ...base, reason: 'repository-not-configured' };
  }
  const readJson = async (url, headers = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          ...headers,
        },
        signal: controller.signal,
      });
      if (response.status !== 200) return null;
      return await response.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };
  const buildInfo = await readJson(buildInfoUrl);
  const liveSha = buildInfo?.commitSha;
  if (!SHA_PATTERN.test(liveSha ?? '')) {
    return { ...base, reason: 'live-sha-unreadable' };
  }
  const githubHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  const head = await readJson(
    `${githubApiUrl}/repos/${repository}/commits/main`,
    githubHeaders
  );
  const mainSha = head?.sha;
  if (!SHA_PATTERN.test(mainSha ?? '')) {
    return { ...base, liveSha, reason: 'main-sha-unreadable' };
  }
  if (mainSha === liveSha) {
    return { ...base, liveSha, mainSha, reason: 'production-current' };
  }
  const compare = await readJson(
    `${githubApiUrl}/repos/${repository}/compare/${liveSha}...${mainSha}`,
    githubHeaders
  );
  const unshippedCommits = Number(compare?.ahead_by);
  const oldestUnshippedAt = compare?.commits?.[0]?.commit?.committer?.date;
  if (!Number.isInteger(unshippedCommits) || unshippedCommits < 0) {
    return { ...base, liveSha, mainSha, reason: 'unshipped-range-unreadable' };
  }
  if (unshippedCommits === 0) {
    return { ...base, liveSha, mainSha, reason: 'production-current' };
  }
  const oldestEpoch = Date.parse(oldestUnshippedAt ?? '');
  if (!Number.isFinite(oldestEpoch)) {
    return {
      ...base,
      liveSha,
      mainSha,
      unshippedCommits,
      reason: 'unshipped-age-unreadable',
    };
  }
  const unshippedAgeSeconds = Math.max(
    0,
    Math.floor((new Date(now).getTime() - oldestEpoch) / 1000)
  );
  const stale = unshippedAgeSeconds >= staleAfterSeconds;
  return {
    ...base,
    healthy: !stale,
    incidentClass: stale ? FRESHNESS_INCIDENT_CLASS : null,
    reason: stale
      ? `unshipped-for-${unshippedAgeSeconds}s`
      : `unshipped-for-${unshippedAgeSeconds}s-within-${staleAfterSeconds}s`,
    liveSha,
    mainSha,
    unshippedCommits,
    oldestUnshippedAt,
    unshippedAgeSeconds,
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
  freshness = null,
  now = new Date(),
  targets = DEFAULT_TARGETS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const observations = await Promise.all([
    ...targets.map(target => observeTarget(target, { fetchImpl, timeoutMs })),
    ...(freshness
      ? [
          observeProductionFreshness({
            ...freshness,
            fetchImpl,
            now,
            timeoutMs,
          }),
        ]
      : []),
  ]);
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

  const requiredBudget = Math.max(budget, Math.ceil(spend + minimumHeadroom));
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
  env = process.env,
  fetchImpl = fetch,
  now = new Date(),
  stdout = process.stdout,
  writeFileImpl = writeFile,
} = {}) {
  const args = parseCliArgs(argv);
  const repository = env.GITHUB_REPOSITORY?.trim() ?? '';
  const result = await observeProductionContinuity({
    fetchImpl,
    freshness: repository
      ? { repository, token: env.GH_TOKEN?.trim() ?? '' }
      : null,
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
        `requires_agent_ingress=${result.requiresAgentIngress}`,
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
