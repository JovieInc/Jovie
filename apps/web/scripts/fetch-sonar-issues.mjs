#!/usr/bin/env node

/**
 * fetch-sonar-issues.mjs — fail-closed, commit-bound SonarCloud inventory.
 * Paginates to exhaustion (createdAt/rules partitioning past the 10k cap),
 * binds to the pinned branch + latest analysis, classifies HTTP failures,
 * dedupes by issue key, reconciles totals. Token via env only, never logged.
 * Exit: 0 = COMPLETE+atomic, 1 = failed (nothing written), 2 = flagged.
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeIssueOutputAtomic } from './atomic-issue-output.mjs';

export const ISSUES_FILE = 'sonar-issues-latest.json';
export const INVENTORY_FILE = 'sonar-issues-inventory.json';
export const PAGE_SIZE = 500;
export const RESULT_CAP = 10_000;
export const DEFAULT_BASE_URL = 'https://sonarcloud.io';
export const DEFAULT_PROJECT_KEY = 'JovieInc_Jovie';
export const DEFAULT_BRANCH = 'main';
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_ATTEMPTS = 4;
export const BASE_DELAY_MS = 250;

const MEASURE_KEYS = [
  'bugs',
  'vulnerabilities',
  'code_smells',
  'security_hotspots',
  'security_hotspots_reviewed',
  'new_bugs',
  'new_vulnerabilities',
  'new_code_smells',
];
const MEASURE_KEYS_FALLBACK = MEASURE_KEYS.slice(0, 4);
const RETRYABLE_KINDS = new Set([
  'rate_limited',
  'server',
  'network',
  'timeout',
]);

export class SonarFetchError extends Error {
  constructor(kind, message, { status, url } = {}) {
    super(message);
    this.name = 'SonarFetchError';
    this.kind = kind;
    this.status = status;
    this.url = url;
  }
}

const defaultSleep = ms => new Promise(resolve_ => setTimeout(resolve_, ms));

export function classifyStatus(status) {
  if (status === 401 || status === 403) return 'credentials';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500 && status < 600) return 'server';
  if (status >= 400) return 'client';
  return 'unexpected';
}

function backoffMs(attempt, baseDelayMs) {
  return Math.min(baseDelayMs * 2 ** (attempt - 1), 8_000);
}

function parseRetryAfterMs(headerValue) {
  if (!headerValue) return 0;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const at = Date.parse(headerValue);
  if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  return 0;
}

async function errorDetail(response) {
  try {
    const parsed = JSON.parse(await response.text());
    if (Array.isArray(parsed?.errors)) {
      return parsed.errors
        .map(entry => entry?.msg)
        .filter(Boolean)
        .join('; ')
        .slice(0, 300);
    }
  } catch {
    // Error bodies are best-effort context only.
  }
  return '';
}

// One JSON GET with bounded retry/backoff; throws a typed SonarFetchError.
// Credentials and client/shape failures are never retried.
export async function fetchJson(
  url,
  {
    token,
    fetchImpl = fetch,
    sleep = defaultSleep,
    maxAttempts = MAX_ATTEMPTS,
    baseDelayMs = BASE_DELAY_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {}
) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const giveUp = kind =>
      !RETRYABLE_KINDS.has(kind) || attempt === maxAttempts;
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const kind =
        error?.name === 'TimeoutError' || error?.name === 'AbortError'
          ? 'timeout'
          : 'network';
      lastError = new SonarFetchError(
        kind,
        `${kind} failure fetching ${url}: ${error?.message ?? error}`,
        { url }
      );
      if (giveUp(kind)) throw lastError;
      await sleep(backoffMs(attempt, baseDelayMs));
      continue;
    }

    if (!response.ok) {
      const kind = classifyStatus(response.status);
      const detail = await errorDetail(response);
      lastError = new SonarFetchError(
        kind,
        `${kind}: HTTP ${response.status} for ${url}${detail ? ` — ${detail}` : ''}`,
        { status: response.status, url }
      );
      if (giveUp(kind)) throw lastError;
      const retryAfterMs = parseRetryAfterMs(
        response.headers?.get?.('retry-after')
      );
      await sleep(Math.max(backoffMs(attempt, baseDelayMs), retryAfterMs));
      continue;
    }

    try {
      return await response.json();
    } catch (error) {
      throw new SonarFetchError(
        'malformed_json',
        `malformed JSON from ${url}: ${error?.message ?? error}`,
        { status: response.status, url }
      );
    }
  }
  throw lastError;
}

function requireShape(condition, message, url) {
  if (!condition)
    throw new SonarFetchError('schema', `${message} from ${url}`, { url });
}

function issuesSearchUrl(baseUrl, params) {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  );
  return `${baseUrl}/api/issues/search?${new URLSearchParams(entries)}`;
}

async function fetchIssueSearch(ctx, params) {
  const url = issuesSearchUrl(ctx.baseUrl, params);
  const json = await fetchJson(url, ctx);
  requireShape(
    json &&
      typeof json === 'object' &&
      json.paging &&
      Number.isInteger(json.paging.pageIndex) &&
      Number.isInteger(json.paging.total) &&
      Array.isArray(json.issues),
    'issues/search response missing or malformed (paging/issues)',
    url
  );
  return json;
}

// Drains a paged endpoint until exhausted or the service result cap.
// `capped` = API-reported total outran what was retrievable (never silent).
async function drainPages(fetchPage) {
  const items = [];
  let apiTotal = 0;
  let page = 1;
  while ((page - 1) * PAGE_SIZE < RESULT_CAP) {
    const { batch, total } = await fetchPage(page);
    apiTotal = total;
    items.push(...batch);
    if (batch.length === 0 || items.length >= apiTotal) break;
    page += 1;
  }
  return { items, apiTotal, capped: items.length < apiTotal };
}

async function collectIssuePages(ctx, params) {
  const { items, apiTotal, capped } = await drainPages(async page => {
    const json = await fetchIssueSearch(ctx, {
      ...params,
      ps: PAGE_SIZE,
      p: page,
      s: 'SEVERITY',
      asc: 'false',
    });
    return { batch: json.issues, total: json.paging.total };
  });
  return { issues: items, apiTotal, capped };
}

function monthWindow(month) {
  const [year, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return {
    createdAfter: `${month}-01`,
    createdBefore: `${month}-${String(last).padStart(2, '0')}`,
  };
}

async function fetchFacetBuckets(ctx, params, facet) {
  const json = await fetchIssueSearch(ctx, {
    ...params,
    ps: 1,
    p: 1,
    facets: facet,
  });
  const entry = Array.isArray(json.facets)
    ? json.facets.find(item => item?.property === facet)
    : undefined;
  requireShape(
    entry && Array.isArray(entry.values),
    `issues/search facet "${facet}" missing or malformed`,
    issuesSearchUrl(ctx.baseUrl, { ...params, facets: facet })
  );
  return entry.values
    .map(v => ({ val: String(v?.val ?? ''), count: Number(v?.count ?? 0) }))
    .filter(v => v.val && v.count > 0);
}

// Collects every issue for a query; on a cap hit partitions on the supported
// `createdAt` month facet, then `rules` inside an over-cap month.
async function collectIssues(
  ctx,
  params,
  incompleteness,
  depth = 0,
  label = 'all'
) {
  const first = await collectIssuePages(ctx, params);
  if (!first.capped) {
    return { records: first.issues, reportedTotal: first.apiTotal };
  }

  if (depth === 0 || depth === 1) {
    const facet = depth === 0 ? 'createdAt' : 'rules';
    const buckets = await fetchFacetBuckets(ctx, params, facet);
    const facetTotal = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
    if (facetTotal < first.apiTotal) {
      ctx.warnings.push(
        `${label}: "${facet}" facet totals (${facetTotal}) diverge from issues/search total (${first.apiTotal})`
      );
    }
    const records = [];
    for (const bucket of buckets) {
      const scopedParams =
        depth === 0
          ? { ...params, ...monthWindow(bucket.val) }
          : { ...params, rules: bucket.val };
      const sub = await collectIssues(
        ctx,
        scopedParams,
        incompleteness,
        depth + 1,
        `${label}/${facet}=${bucket.val}`
      );
      records.push(...sub.records);
    }
    return { records, reportedTotal: first.apiTotal };
  }

  incompleteness.push({
    partition: label,
    reason: 'result_cap_exceeded',
    apiTotal: first.apiTotal,
    fetched: first.issues.length,
  });
  return { records: first.issues, reportedTotal: first.apiTotal };
}

async function fetchHotspots(ctx, incompleteness) {
  const params = {
    projectKey: ctx.projectKey,
    branch: ctx.branch,
    status: 'TO_REVIEW',
  };
  const { items: hotspots, apiTotal } = await drainPages(async page => {
    const url = `${ctx.baseUrl}/api/hotspots/search?${new URLSearchParams({ ...params, ps: String(PAGE_SIZE), p: String(page) })}`;
    const json = await fetchJson(url, ctx);
    requireShape(
      json?.paging &&
        Number.isInteger(json.paging.pageIndex) &&
        Number.isInteger(json.paging.total) &&
        Array.isArray(json.hotspots),
      'hotspots/search paging metadata missing or malformed',
      url
    );
    return { batch: json.hotspots, total: json.paging.total };
  });
  if (hotspots.length < apiTotal) {
    incompleteness.push({
      partition: 'hotspots:TO_REVIEW',
      reason:
        hotspots.length >= RESULT_CAP
          ? 'result_cap_exceeded'
          : 'empty_page_before_api_total',
      apiTotal,
      fetched: hotspots.length,
    });
  }
  return { hotspots, apiTotal };
}

// Best-effort endpoint: returns the fetcher's value, or null + warning on
// failure — optional evidence degrades, never fails closed.
async function optional(ctx, fetcher, label) {
  try {
    return await fetcher();
  } catch (error) {
    const kind = error instanceof SonarFetchError ? error.kind : 'unknown';
    ctx.warnings.push(`${label} unavailable: ${kind}`);
    return null;
  }
}

async function latestAnalysis(ctx) {
  const url = `${ctx.baseUrl}/api/project_analyses/search?${new URLSearchParams({ project: ctx.projectKey, branch: ctx.branch, ps: '1' }).toString()}`;
  return optional(
    ctx,
    async () => {
      const json = await fetchJson(url, ctx);
      const a = Array.isArray(json?.analyses) ? json.analyses[0] : undefined;
      return a?.key
        ? { key: a.key, date: a.date ?? null, revision: a.revision ?? null }
        : null;
    },
    'project analysis binding'
  );
}

async function validateProjectAndBranch(ctx) {
  const url = `${ctx.baseUrl}/api/components/show?${new URLSearchParams({ component: ctx.projectKey, branch: ctx.branch }).toString()}`;
  try {
    const json = await fetchJson(url, ctx);
    requireShape(
      json?.component && typeof json.component === 'object',
      'components/show component missing',
      url
    );
    return json.component;
  } catch (error) {
    if (!(error instanceof SonarFetchError && error.kind === 'not_found')) {
      throw error;
    }
    throw new SonarFetchError(
      'not_found',
      `project "${ctx.projectKey}" or branch "${ctx.branch}" not found on ${ctx.baseUrl} — refusing to collect an unbound inventory`,
      { status: 404, url }
    );
  }
}

async function fetchNewCodeTotal(ctx) {
  return optional(
    ctx,
    async () => {
      const json = await fetchIssueSearch(ctx, {
        componentKeys: ctx.projectKey,
        branch: ctx.branch,
        resolved: 'false',
        inNewCodePeriod: 'true',
        ps: 1,
        p: 1,
      });
      return json.paging.total;
    },
    'new-code issue total'
  );
}

async function fetchMeasures(ctx) {
  const urlFor = keys =>
    `${ctx.baseUrl}/api/measures/component?${new URLSearchParams({ component: ctx.projectKey, branch: ctx.branch, metricKeys: keys.join(',') }).toString()}`;

  for (const keys of [MEASURE_KEYS, MEASURE_KEYS_FALLBACK]) {
    const url = urlFor(keys);
    try {
      const json = await fetchJson(url, ctx);
      const measures = {};
      for (const measure of json?.component?.measures ?? []) {
        const value = measure?.value ?? measure?.period?.value ?? null;
        if (measure?.metric && value !== null) {
          measures[measure.metric] = Number(value);
        }
      }
      return { status: 'ok', metrics: measures };
    } catch (error) {
      // Unsupported metric set in this project's mode — degrade.
      if (
        error instanceof SonarFetchError &&
        (error.kind === 'client' || error.kind === 'not_found')
      ) {
        continue;
      }
      const kind = error instanceof SonarFetchError ? error.kind : 'unknown';
      ctx.warnings.push(`measures reconciliation unavailable: ${kind}`);
      return { status: 'unavailable', metrics: {} };
    }
  }
  return { status: 'unsupported', metrics: {} };
}

function gitOut(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function countBy(issues, field) {
  const counts = {};
  for (const issue of issues) {
    const value = issue?.[field] ?? 'UNKNOWN';
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function dedupeByKey(records) {
  const seen = new Map();
  let duplicatesDropped = 0;
  let missingKey = 0;
  for (const record of records) {
    const key = record?.key;
    if (!key) {
      missingKey += 1;
      seen.set(Symbol(), record);
      continue;
    }
    if (seen.has(key)) {
      duplicatesDropped += 1;
      continue;
    }
    seen.set(key, record);
  }
  return { records: [...seen.values()], duplicatesDropped, missingKey };
}

async function collectAll(ctx) {
  const incompleteness = [];

  const scoped = { componentKeys: ctx.projectKey, branch: ctx.branch };
  const openCollected = await collectIssues(
    ctx,
    { ...scoped, resolved: 'false' },
    incompleteness,
    0,
    'issues:open'
  );
  const acceptedCollected = await collectIssues(
    ctx,
    {
      ...scoped,
      resolved: 'true',
      resolutions: 'FALSE-POSITIVE,WONTFIX',
    },
    incompleteness,
    0,
    'issues:accepted'
  );

  const { hotspots, apiTotal: hotspotsApiTotal } = await fetchHotspots(
    ctx,
    incompleteness
  );

  const newCodeTotal = await fetchNewCodeTotal(ctx);
  const measures = await fetchMeasures(ctx);

  const open = dedupeByKey(openCollected.records);
  const accepted = dedupeByKey(acceptedCollected.records);
  const hotspotsDeduped = dedupeByKey(hotspots);

  return {
    incompleteness,
    open,
    openReportedTotal: openCollected.reportedTotal,
    accepted,
    acceptedReportedTotal: acceptedCollected.reportedTotal,
    hotspots: hotspotsDeduped,
    hotspotsApiTotal,
    newCodeTotal,
    measures,
  };
}

/** Full collection → { status, atomic, issues, inventory }; writes nothing. */
export async function collectInventory({
  baseUrl = DEFAULT_BASE_URL,
  projectKey = DEFAULT_PROJECT_KEY,
  branch = DEFAULT_BRANCH,
  token,
  fetchImpl = fetch,
  sleep = defaultSleep,
  cwd = process.cwd(),
  env = process.env,
  logger = console,
} = {}) {
  const startedAt = Date.now();
  const warnings = [];
  const ctx = {
    baseUrl,
    projectKey,
    branch,
    token,
    fetchImpl,
    sleep,
    cwd,
    env,
    logger,
    warnings,
  };

  if (!token) {
    throw new SonarFetchError(
      'credentials',
      'SONAR_TOKEN environment variable is required — pass it via env only, never as an argument'
    );
  }

  await validateProjectAndBranch(ctx);

  // Snapshot → collect → verify binds the inventory to one analysis. On drift,
  // retry once then flag non-atomic rather than mixing versions.
  let bundle;
  let boundAnalysis = null;
  let atomic = true;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const before = await latestAnalysis(ctx);
    bundle = await collectAll(ctx);
    const after = await latestAnalysis(ctx);
    boundAnalysis = after ?? before;
    const drifted = Boolean(
      before?.key && after?.key && before.key !== after.key
    );
    if (!drifted) {
      break;
    }
    if (attempt === 2) {
      atomic = false;
      warnings.push(
        `project analysis changed twice during collection (${before.key} → ${after.key}); inventory may mix analysis versions`
      );
      break;
    }
    logger.warn(
      'SonarCloud analysis changed mid-collection; retrying once for atomicity'
    );
  }

  const {
    incompleteness,
    open,
    openReportedTotal,
    accepted,
    acceptedReportedTotal,
    hotspots,
    hotspotsApiTotal,
    newCodeTotal,
    measures,
  } = bundle;

  // Reconcile unique fetches against the API-reported total per collection.
  const reconcile = (partition, reported, records) => {
    if (reported !== null && records.length < reported) {
      incompleteness.push({
        partition,
        reason: 'fetched_unique_below_api_total',
        apiTotal: reported,
        fetched: records.length,
      });
    }
    return {
      apiTotal: reported,
      fetchedUnique: records.length,
      matches: reported === null || records.length >= reported,
    };
  };
  const reconciliation = {
    open: reconcile('issues:open', openReportedTotal, open.records),
    accepted: reconcile(
      'issues:accepted',
      acceptedReportedTotal,
      accepted.records
    ),
    measures,
  };

  const measureMismatches = [];
  const measureMap = {
    BUG: 'bugs',
    VULNERABILITY: 'vulnerabilities',
    CODE_SMELL: 'code_smells',
  };
  if (measures.status === 'ok') {
    const byType = countBy(open.records, 'type');
    for (const [type, metric] of Object.entries(measureMap)) {
      const measure = measures.metrics[metric];
      if (
        metric in measures.metrics &&
        type in byType &&
        measure !== byType[type]
      ) {
        measureMismatches.push({ metric, type, measure, issues: byType[type] });
      }
    }
  }
  if (measureMismatches.length > 0) {
    warnings.push(
      `published measures diverge from issue inventory: ${JSON.stringify(measureMismatches)}`
    );
  }

  if (open.missingKey > 0 || accepted.missingKey > 0) {
    warnings.push(
      `${open.missingKey + accepted.missingKey} records arrived without a stable issue key`
    );
  }

  const status = incompleteness.length === 0 ? 'COMPLETE' : 'INCOMPLETE';
  const usesImpacts = open.records.some(issue => Array.isArray(issue?.impacts));

  const sha = ctx.env?.GITHUB_SHA || gitOut(['rev-parse', 'HEAD'], ctx.cwd);
  const stale = Boolean(
    boundAnalysis?.revision && sha && boundAnalysis.revision !== sha
  );
  if (stale) {
    warnings.push(
      `bound analysis revision ${boundAnalysis.revision} lags observed commit ${sha} — findings may not reflect current ${branch}`
    );
  }

  const inventory = {
    schema: 'jovie-sonar-inventory/v1',
    status,
    atomic,
    collectedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    projectKey,
    branch,
    observedSha: sha,
    staleness: {
      analysisRevision: boundAnalysis?.revision ?? null,
      observedSha: sha,
      stale,
    },
    sonarMode: usesImpacts ? 'mqr' : 'standard',
    analysis: boundAnalysis,
    counts: {
      open: {
        apiTotal: openReportedTotal,
        fetched: open.records.length,
        duplicatesDropped: open.duplicatesDropped,
        bySeverity: countBy(open.records, 'severity'),
        byType: countBy(open.records, 'type'),
        byStatus: countBy(open.records, 'status'),
      },
      newCode: { apiTotal: newCodeTotal },
      acceptedFalsePositive: {
        fetched: accepted.records.length,
        duplicatesDropped: accepted.duplicatesDropped,
        byResolution: countBy(accepted.records, 'resolution'),
        byIssueStatus: countBy(accepted.records, 'issueStatus'),
      },
      hotspotsToReview: {
        apiTotal: hotspotsApiTotal,
        fetched: hotspots.records.length,
        duplicatesDropped: hotspots.duplicatesDropped,
      },
    },
    reconciliation,
    incompleteness,
    warnings,
    acceptedFalsePositive: accepted.records,
    hotspots: hotspots.records,
  };

  return {
    status,
    atomic,
    issues: open.records,
    inventory,
  };
}

export async function main(
  env = process.env,
  {
    fetchImpl,
    sleep = defaultSleep,
    exit = code => process.exit(code),
    cwd = process.cwd(),
    logger = console,
  } = {}
) {
  const token = env.SONAR_TOKEN?.trim();
  if (!token) {
    logger.error(
      '❌ SONAR_TOKEN is not set — export it in the environment (never on the command line) before running this script.'
    );
    return exit(1);
  }

  try {
    const result = await collectInventory({
      baseUrl: env.SONAR_BASE_URL || DEFAULT_BASE_URL,
      projectKey: env.SONAR_PROJECT_KEY || DEFAULT_PROJECT_KEY,
      branch: env.SONAR_BRANCH || DEFAULT_BRANCH,
      token,
      fetchImpl,
      sleep,
      cwd,
      env,
      logger,
    });

    const root = gitOut(['rev-parse', '--show-toplevel'], cwd) ?? cwd;
    const [issuesPath, inventoryPath] = [
      [ISSUES_FILE, result.issues],
      [INVENTORY_FILE, result.inventory],
    ].map(([file, data]) =>
      writeIssueOutputAtomic(file, JSON.stringify(data, null, 2), { root })
    );

    logger.log(
      `Sonar: ${result.issues.length} issues — ${result.status} (atomic: ${result.atomic}) → ${issuesPath} + ${inventoryPath}`
    );
    return exit(result.status === 'COMPLETE' && result.atomic ? 0 : 2);
  } catch (error) {
    const kind = error instanceof SonarFetchError ? error.kind : 'unknown';
    logger.error(
      `❌ SonarCloud collection failed [${kind}]: ${error?.message ?? error} — no inventory written; last-known evidence left untouched`
    );
    return exit(1);
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedPath) {
  await main();
}
