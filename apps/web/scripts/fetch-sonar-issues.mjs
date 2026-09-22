#!/usr/bin/env node

/**
 * fetch-sonar-issues.mjs — complete, commit-bound SonarCloud findings inventory.
 *
 * JOV-6245: replaces the fixed three-page curl loop with a fail-closed
 * collector:
 *  - real pagination driven by the API's paging metadata, never a fixed count
 *  - partitions by `createdAt` month (then `rules`) when the 10,000-result
 *    service cap is hit, or reports INCOMPLETE — never silently truncates
 *  - pins the branch and binds the run to the latest project analysis
 *    (key/date/revision); a mid-collection analysis change triggers one retry,
 *    then the inventory is marked non-atomic
 *  - classifies HTTP failures (credentials / 429 / timeout / 5xx / malformed
 *    JSON / genuinely empty) with bounded retry + backoff
 *  - deduplicates by stable issue key and reconciles fetched totals against
 *    the API's reported totals and published measures
 *
 * Configuration is read from the environment only; the token is never logged:
 *   SONAR_TOKEN        required bearer token
 *   SONAR_PROJECT_KEY  default JovieInc_Jovie
 *   SONAR_BRANCH       default main
 *   SONAR_BASE_URL     default https://sonarcloud.io
 *
 * Exit codes:
 *   0 — COMPLETE, atomic inventory written
 *   1 — collection failed; nothing written (last-known evidence left intact)
 *   2 — inventory written but flagged INCOMPLETE and/or non-atomic
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

const MEASURE_KEYS_FALLBACK = [
  'bugs',
  'vulnerabilities',
  'code_smells',
  'security_hotspots',
];

const RETRYABLE_KINDS = new Set(['rate_limited', 'server', 'network', 'timeout']);

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
    const text = await response.text();
    const parsed = JSON.parse(text);
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

/**
 * One JSON GET against the SonarCloud web API with bounded retry/backoff.
 * Throws a typed SonarFetchError; credentials and client/shape failures are
 * never retried.
 */
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
      if (!RETRYABLE_KINDS.has(kind) || attempt === maxAttempts) {
        throw lastError;
      }
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
      if (!RETRYABLE_KINDS.has(kind) || attempt === maxAttempts) {
        throw lastError;
      }
      const retryAfterMs = parseRetryAfterMs(
        response.headers?.get?.('retry-after')
      );
      await sleep(
        Math.max(backoffMs(attempt, baseDelayMs), retryAfterMs)
      );
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
  if (!condition) {
    throw new SonarFetchError('schema', `${message} from ${url}`, { url });
  }
}

function issuesSearchUrl(baseUrl, params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  return `${baseUrl}/api/issues/search?${query.toString()}`;
}

async function fetchIssueSearch(ctx, params) {
  const url = issuesSearchUrl(ctx.baseUrl, params);
  const json = await fetchJson(url, ctx);
  requireShape(
    json && typeof json === 'object',
    'issues/search response is not an object',
    url
  );
  requireShape(
    json.paging &&
      Number.isInteger(json.paging.pageIndex) &&
      Number.isInteger(json.paging.total),
    'issues/search paging metadata missing or malformed',
    url
  );
  requireShape(
    Array.isArray(json.issues),
    'issues/search issues array missing',
    url
  );
  return json;
}

/**
 * Drains every page of one issues/search query. Stops at the service result
 * cap and reports `capped` when the API-reported total outruns what was
 * retrievable, rather than silently truncating.
 */
async function collectIssuePages(ctx, params) {
  const issues = [];
  let apiTotal = 0;
  let page = 1;

  while ((page - 1) * PAGE_SIZE < RESULT_CAP) {
    const json = await fetchIssueSearch(ctx, {
      ...params,
      ps: PAGE_SIZE,
      p: page,
      s: 'SEVERITY',
      asc: 'false',
    });
    apiTotal = json.paging.total;
    const batch = json.issues;
    issues.push(...batch);
    if (batch.length === 0 || issues.length >= apiTotal) break;
    page += 1;
  }

  // Either the service cap or an early empty page leaves fetched < apiTotal —
  // both are reported as `capped` and routed to partitioning/reconciliation.
  return {
    issues,
    apiTotal,
    capped: issues.length < apiTotal,
  };
}

function monthWindow(month) {
  const [year, monthNum] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  return {
    createdAfter: `${month}-01`,
    createdBefore: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

async function fetchFacetBuckets(ctx, params, facet) {
  const json = await fetchIssueSearch(ctx, { ...params, ps: 1, p: 1, facets: facet });
  const entry = Array.isArray(json.facets)
    ? json.facets.find(item => item?.property === facet)
    : undefined;
  requireShape(
    entry && Array.isArray(entry.values),
    `issues/search facet "${facet}" missing or malformed`,
    issuesSearchUrl(ctx.baseUrl, { ...params, facets: facet })
  );
  return entry.values
    .map(value => ({ val: String(value?.val ?? ''), count: Number(value?.count ?? 0) }))
    .filter(value => value.val && value.count > 0);
}

/**
 * Collects every issue for a query, partitioning on the API-supported
 * `createdAt` month buckets (then `rules` inside an over-cap month) when the
 * 10k result cap would otherwise truncate the inventory.
 */
async function collectIssues(ctx, params, incompleteness, depth = 0, label = 'all') {
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
  const url = page =>
    `${ctx.baseUrl}/api/hotspots/search?${new URLSearchParams({ ...params, ps: String(PAGE_SIZE), p: String(page) }).toString()}`;

  const hotspots = [];
  let apiTotal = 0;
  let page = 1;
  while ((page - 1) * PAGE_SIZE < RESULT_CAP) {
    const pageUrl = url(page);
    const json = await fetchJson(pageUrl, ctx);
    requireShape(
      json?.paging &&
        Number.isInteger(json.paging.pageIndex) &&
        Number.isInteger(json.paging.total) &&
        Array.isArray(json.hotspots),
      'hotspots/search paging metadata missing or malformed',
      pageUrl
    );
    apiTotal = json.paging.total;
    const batch = json.hotspots;
    hotspots.push(...batch);
    if (batch.length === 0 || hotspots.length >= apiTotal) break;
    page += 1;
  }
  if (hotspots.length < apiTotal) {
    incompleteness.push({
      partition: 'hotspots:TO_REVIEW',
      reason:
        hotspots.length >= RESULT_CAP ? 'result_cap_exceeded' : 'empty_page_before_api_total',
      apiTotal,
      fetched: hotspots.length,
    });
  }
  return { hotspots, apiTotal };
}

async function latestAnalysis(ctx) {
  const url = `${ctx.baseUrl}/api/project_analyses/search?${new URLSearchParams({ project: ctx.projectKey, branch: ctx.branch, ps: '1' }).toString()}`;
  try {
    const json = await fetchJson(url, ctx);
    const analysis = Array.isArray(json?.analyses) ? json.analyses[0] : undefined;
    if (!analysis?.key) return null;
    return {
      key: analysis.key,
      date: analysis.date ?? null,
      revision: analysis.revision ?? null,
    };
  } catch (error) {
    ctx.warnings.push(
      `project analysis binding unavailable: ${error?.kind ?? 'unknown'} (${error?.message ?? error})`
    );
    return null;
  }
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
    if (error instanceof SonarFetchError && error.kind === 'not_found') {
      throw new SonarFetchError(
        'not_found',
        `project "${ctx.projectKey}" or branch "${ctx.branch}" not found on ${ctx.baseUrl} — refusing to collect an unbound inventory`,
        { status: 404, url }
      );
    }
    throw error;
  }
}

async function fetchNewCodeTotal(ctx) {
  try {
    const json = await fetchIssueSearch(ctx, {
      componentKeys: ctx.projectKey,
      branch: ctx.branch,
      resolved: 'false',
      inNewCodePeriod: 'true',
      ps: 1,
      p: 1,
    });
    return json.paging.total;
  } catch (error) {
    ctx.warnings.push(
      `new-code issue total unavailable: ${error?.kind ?? 'unknown'}`
    );
    return null;
  }
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
      if (error instanceof SonarFetchError && error.kind === 'client') {
        continue; // unsupported metric set in this project's mode — degrade
      }
      if (error instanceof SonarFetchError && error.kind === 'not_found') {
        continue;
      }
      ctx.warnings.push(
        `measures reconciliation unavailable: ${error?.kind ?? 'unknown'}`
      );
      return { status: 'unavailable', metrics: {} };
    }
  }
  return { status: 'unsupported', metrics: {} };
}

function observedSha(ctx) {
  if (ctx.env?.GITHUB_SHA) return ctx.env.GITHUB_SHA;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ctx.cwd,
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

  const openCollected = await collectIssues(
    ctx,
    { componentKeys: ctx.projectKey, branch: ctx.branch, resolved: 'false' },
    incompleteness,
    0,
    'issues:open'
  );

  const acceptedCollected = await collectIssues(
    ctx,
    {
      componentKeys: ctx.projectKey,
      branch: ctx.branch,
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

/**
 * Runs the whole collection and returns { status, issues, inventory } without
 * writing anything, so tests can drive it with a mocked fetchImpl.
 */
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

  // Snapshot → collect → verify binds the inventory to one analysis. A drifted
  // analysis means pages may mix versions: retry the full collection once, then
  // flag non-atomic rather than presenting mixed evidence as complete.
  let bundle;
  let boundAnalysis = null;
  let atomic = true;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const before = await latestAnalysis(ctx);
    bundle = await collectAll(ctx);
    const after = await latestAnalysis(ctx);
    boundAnalysis = after ?? before;
    const drifted = Boolean(before?.key && after?.key && before.key !== after.key);
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

  const reconciliation = {
    open: {
      apiTotal: openReportedTotal,
      fetchedUnique: open.records.length,
      matches:
        openReportedTotal === null ||
        open.records.length >= openReportedTotal,
    },
    accepted: {
      apiTotal: acceptedReportedTotal,
      fetchedUnique: accepted.records.length,
      matches:
        acceptedReportedTotal === null ||
        accepted.records.length >= acceptedReportedTotal,
    },
    measures,
  };

  if (openReportedTotal !== null && open.records.length < openReportedTotal) {
    incompleteness.push({
      partition: 'issues:open',
      reason: 'fetched_unique_below_api_total',
      apiTotal: openReportedTotal,
      fetched: open.records.length,
    });
  }
  if (
    acceptedReportedTotal !== null &&
    accepted.records.length < acceptedReportedTotal
  ) {
    incompleteness.push({
      partition: 'issues:accepted',
      reason: 'fetched_unique_below_api_total',
      apiTotal: acceptedReportedTotal,
      fetched: accepted.records.length,
    });
  }

  const measureMismatches = [];
  const measureMap = { BUG: 'bugs', VULNERABILITY: 'vulnerabilities', CODE_SMELL: 'code_smells' };
  if (measures.status === 'ok') {
    const byType = countBy(open.records, 'type');
    for (const [type, metric] of Object.entries(measureMap)) {
      if (metric in measures.metrics && type in byType) {
        if (measures.metrics[metric] !== byType[type]) {
          measureMismatches.push({
            metric,
            type,
            measure: measures.metrics[metric],
            issues: byType[type],
          });
        }
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

  const inventory = {
    schema: 'jovie-sonar-inventory/v1',
    status,
    atomic,
    collectedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    projectKey,
    branch,
    observedSha: observedSha(ctx),
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

function printSummary(result) {
  const { counts } = result.inventory;
  console.log(`✅ Fetched ${counts.open.fetched} unique open issues`);
  if (result.inventory.observedSha) {
    console.log(`   Observed commit: ${result.inventory.observedSha}`);
  }
  if (result.inventory.analysis) {
    console.log(
      `   Bound to analysis ${result.inventory.analysis.key} (${result.inventory.analysis.date ?? 'no date'})`
    );
  }

  const group = (by, label) => {
    console.log(`\n📊 Issues by ${label}:`);
    for (const [name, count] of Object.entries(by).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${name}: ${count}`);
    }
  };
  group(counts.open.bySeverity, 'severity');
  group(counts.open.byType, 'type');

  console.log('\n📊 Top 10 rules:');
  const byRule = countBy(result.issues, 'rule');
  for (const [rule, count] of Object.entries(byRule)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)) {
    console.log(`   ${rule}: ${count}`);
  }

  console.log(
    `\n   New-code issues: ${counts.newCode.apiTotal ?? 'unavailable'}`
  );
  console.log(
    `   Accepted / false-positive: ${counts.acceptedFalsePositive.fetched}`
  );
  console.log(
    `   Security hotspots to review: ${counts.hotspotsToReview.fetched}`
  );
  console.log(`   Status: ${result.inventory.status}, atomic: ${result.inventory.atomic}`);

  if (result.inventory.incompleteness.length > 0) {
    console.log('\n⚠️  INCOMPLETE partitions:');
    for (const entry of result.inventory.incompleteness) {
      console.log(
        `   ${entry.partition}: ${entry.reason} (${entry.fetched}/${entry.apiTotal} fetched)`
      );
    }
  }
  if (result.inventory.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    for (const warning of result.inventory.warnings) {
      console.log(`   ${warning}`);
    }
  }
}

function repoRoot(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return cwd;
  }
}

export async function main(env = process.env) {
  const token = env.SONAR_TOKEN?.trim();
  if (!token) {
    console.error(
      '❌ SONAR_TOKEN is not set — export it in the environment (never on the command line) before running this script.'
    );
    process.exit(1);
  }

  console.log('🔍 Fetching SonarCloud issues...');
  try {
    const result = await collectInventory({
      baseUrl: env.SONAR_BASE_URL || DEFAULT_BASE_URL,
      projectKey: env.SONAR_PROJECT_KEY || DEFAULT_PROJECT_KEY,
      branch: env.SONAR_BRANCH || DEFAULT_BRANCH,
      token,
    });

    const root = repoRoot(process.cwd());
    const issuesPath = writeIssueOutputAtomic(
      ISSUES_FILE,
      JSON.stringify(result.issues, null, 2),
      { root }
    );
    const inventoryPath = writeIssueOutputAtomic(
      INVENTORY_FILE,
      JSON.stringify(result.inventory, null, 2),
      { root }
    );

    printSummary(result);
    console.log(`\n💾 Saved issues to: ${issuesPath}`);
    console.log(`💾 Saved inventory to: ${inventoryPath}`);

    process.exit(result.status === 'COMPLETE' && result.atomic ? 0 : 2);
  } catch (error) {
    const kind = error instanceof SonarFetchError ? error.kind : 'unknown';
    console.error(`\n❌ SonarCloud collection failed [${kind}]: ${error?.message ?? error}`);
    console.error('   No inventory written; last-known evidence left untouched.');
    process.exit(1);
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedPath) {
  await main();
}
