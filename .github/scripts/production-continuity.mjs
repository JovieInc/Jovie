#!/usr/bin/env node

import { appendFileSync } from 'node:fs';
import { appendFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { readJson as readObservedJson } from '../../scripts/lib/github-json-read.mjs';
import { readMainArrival } from './production-continuity-arrival.mjs';

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
  // Unknown required evidence is never healthy (JOV-7694: "Unknown required
  // evidence behaves as RED"). `healthy: false` is a verified failure;
  // anything other than strict true/false is unknown and keeps the rollup
  // non-healthy. A verified failure always outranks unknown.
  const unhealthy = observations.filter(item => item.healthy === false);
  const unknown = observations.filter(
    item => item.healthy !== true && item.healthy !== false
  );
  const status =
    unhealthy.length > 0
      ? 'unhealthy'
      : unknown.length > 0
        ? 'unknown'
        : 'healthy';
  return {
    schema: CONTINUITY_SCHEMA,
    observedAt: new Date(now).toISOString(),
    status,
    targets: observations,
    affectedTargets: unhealthy.map(item => item.id),
    unknownTargets: unknown.map(item => item.id),
    unknownReasons: unknown.map(item => item.reason ?? 'unknown'),
    incidentClasses: [...new Set(unhealthy.map(item => item.incidentClass))],
    requiresFounderNotification: unhealthy.length > 0,
    // Every unhealthy verdict is admitted to Summer's No Unattended Red queue.
    // A stale production is a release-pipeline failure, not a provider outage,
    // so it routes as production-controller-failed (gem investigates) instead
    // of provider-unavailable. It used to be skipped, so only the founder knew.
    requiresAgentIngress: unhealthy.length > 0,
    agentIngressFailure: unhealthy.some(
      item => item.incidentClass !== FRESHNESS_INCIDENT_CLASS
    )
      ? 'provider-unavailable'
      : 'production-controller-failed',
  };
}

export const FRESHNESS_TARGET_ID = 'jovie-production-freshness';
export const FRESHNESS_INCIDENT_CLASS = 'production-stale';
// Fallback only: 246 minutes, the measured p95 of normal merge-to-production lag over the 7 days to 2026-10-25.
// The live bound is recomputed weekly from the trailing 7 days by the lanes doctor (its deploy_health module)
// and read from the public lanes feed (`deployHealth.limits`); see resolveStaleAfterSeconds.
export const DEFAULT_STALE_AFTER_SECONDS = 14760;
const MIN_STALE_AFTER_SECONDS = 3600;
const MAX_STALE_AFTER_SECONDS = 86_400;

/** The freshness bound for `repository`: the feed's measured limit when readable and sane, else the fallback. */
export async function resolveStaleAfterSeconds({
  fetchImpl = fetch,
  limitsUrl = '',
  repository = '',
  fallback = DEFAULT_STALE_AFTER_SECONDS,
  timeoutMs = 5000,
} = {}) {
  if (!limitsUrl || !repository) return fallback;
  try {
    const response = await fetchImpl(limitsUrl, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return fallback;
    const age = (await response.json())?.deployHealth?.limits?.[repository]
      ?.ageS;
    return Number.isFinite(age) &&
      age >= MIN_STALE_AFTER_SECONDS &&
      age <= MAX_STALE_AFTER_SECONDS
      ? Math.floor(age)
      : fallback;
  } catch {
    return fallback;
  }
}
const SHA_PATTERN = /^[0-9a-f]{40}$/;
// Strict: only a real string can be a SHA (RegExp.test would stringify arrays).
const isSha = value => typeof value === 'string' && SHA_PATTERN.test(value);
// Strict: the compare API returns ahead_by as a JSON number. Only a finite
// non-negative integer number is accepted; null, '', false, undefined, numeric
// strings such as '3', negatives, fractions, NaN and anything else are unknown.
// Number()/parseInt coercion is deliberately avoided (Number(null) === 0).
const isCommitCount = value => Number.isSafeInteger(value) && value >= 0;

/** Main-arrival evidence only; missing evidence cannot page or resolve. */
export async function observeProductionFreshness({
  buildInfoUrl = DEFAULT_TARGETS[0].url,
  fetchImpl = fetch,
  githubApiUrl = 'https://api.github.com',
  now = new Date(),
  repository,
  staleAfterSeconds = DEFAULT_STALE_AFTER_SECONDS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  token = '',
  githubClient,
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
    unshippedArrivedAt: null,
    unshippedAgeSeconds: 0,
    unshippedAgeIsLowerBound: false,
  };
  const unknownResult = extra => ({ ...base, ...extra, healthy: null });
  // An unconfigured repository is an absent probe, not unreadable evidence.
  if (!/^[^/]+\/[^/]+$/.test(repository ?? '')) {
    return { ...base, reason: 'repository-not-configured' };
  }
  const readJson = async (url, headers = {}) => {
    const result = await readObservedJson(
      fetchImpl,
      url,
      {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        ...headers,
      },
      timeoutMs
    );
    return result.ok ? result.body : null;
  };
  const buildInfo = await readJson(buildInfoUrl);
  const liveSha = buildInfo?.commitSha;
  if (!isSha(liveSha)) {
    return unknownResult({ reason: 'live-sha-unreadable' });
  }
  const githubHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  const head = await readJson(
    `${githubApiUrl}/repos/${repository}/commits/main`,
    githubHeaders
  );
  const mainSha = head?.sha;
  if (!isSha(mainSha)) {
    return unknownResult({ liveSha, reason: 'main-sha-unreadable' });
  }
  if (mainSha === liveSha) {
    return { ...base, liveSha, mainSha, reason: 'production-current' };
  }
  const compare = await readJson(
    `${githubApiUrl}/repos/${repository}/compare/${liveSha}...${mainSha}`,
    githubHeaders
  );
  const unshippedCommits = compare?.ahead_by;
  if (!isCommitCount(unshippedCommits)) {
    return unknownResult({
      liveSha,
      mainSha,
      reason: 'unshipped-count-unreadable',
    });
  }
  if (unshippedCommits === 0) {
    return { ...base, liveSha, mainSha, reason: 'production-current' };
  }
  const arrival = await readMainArrival({
    compare,
    liveSha,
    mainSha,
    repository,
    token,
    fetchImpl,
    githubApiUrl,
    now,
    timeoutMs,
    githubClient,
    staleAfterSeconds,
  });
  if (!arrival.ok) {
    return unknownResult({
      liveSha,
      mainSha,
      unshippedCommits,
      reason: arrival.reason,
    });
  }
  const { oldestUnshippedAt, unshippedArrivedAt, unshippedAgeSeconds } =
    arrival;
  const stale = unshippedAgeSeconds >= staleAfterSeconds;
  return {
    ...base,
    healthy: !stale,
    incidentClass: stale ? FRESHNESS_INCIDENT_CLASS : null,
    reason: stale
      ? `unshipped-for-${arrival.unshippedAgeIsLowerBound ? 'at-least-' : ''}${unshippedAgeSeconds}s`
      : `unshipped-for-${unshippedAgeSeconds}s-within-${staleAfterSeconds}s`,
    liveSha,
    mainSha,
    unshippedCommits,
    oldestUnshippedAt,
    unshippedArrivedAt,
    unshippedAgeSeconds,
    unshippedAgeIsLowerBound: arrival.unshippedAgeIsLowerBound,
    catchingUp: !stale,
    summary: stale
      ? `behind by ${unshippedCommits}, stale`
      : `behind by ${unshippedCommits}, catching up`,
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

/**
 * Remediation verdict for the intake: only an observed `healthy` rollup from a
 * successful observe job is `success`. A failed observe job or `unhealthy`
 * rollup is `failure` (a verified failure outranks unknown). Anything else,
 * including `unknown` and a missing status, is `unknown` and never resolves.
 */
export function remediationConclusion({ observeResult, status } = {}) {
  if (observeResult !== 'success' || status === 'unhealthy') return 'failure';
  return status === 'healthy' ? 'success' : 'unknown';
}

export function continuityIncidentKey(result) {
  if (result?.schema !== CONTINUITY_SCHEMA) {
    throw new Error(
      'continuity incident key requires a valid continuity result'
    );
  }
  if (result.status === 'healthy') return 'production-continuity:healthy';
  if (result.status === 'unknown') {
    return `production-continuity:unknown:${result.unknownTargets.join(',')}`;
  }
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
  githubClient,
} = {}) {
  const args = parseCliArgs(argv);
  const repository = env.GITHUB_REPOSITORY?.trim() ?? '';
  const result = await observeProductionContinuity({
    fetchImpl,
    freshness: repository
      ? {
          repository,
          githubClient,
          token: env.GH_TOKEN?.trim() ?? '',
          staleAfterSeconds: await resolveStaleAfterSeconds({
            fetchImpl,
            limitsUrl: env.PRODUCTION_LIMITS_FEED_URL?.trim() ?? '',
            repository,
          }),
        }
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
        `unknown_targets=${result.unknownTargets.join(',')}`,
        `unknown_reasons=${result.unknownReasons.join(',')}`,
        `incident_key=${incidentKey}`,
        `requires_agent_ingress=${result.requiresAgentIngress}`,
        `agent_ingress_failure=${result.agentIngressFailure}`,
      ].join('\n') + '\n',
      'utf8'
    );
  }
  stdout.write(serialized);
  return { ...result, incidentKey };
}

if (
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href &&
  process.argv[2] === '--remediation-conclusion'
) {
  const conclusion = remediationConclusion({
    observeResult: process.env.OBSERVE_RESULT,
    status: process.env.OBSERVE_STATUS,
  });
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `conclusion=${conclusion}\n`);
  }
  process.stdout.write(`${conclusion}\n`);
} else if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
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
