#!/usr/bin/env node

const SENTRY_API = 'https://sentry.io/api/0';
const GITHUB_API = 'https://api.github.com';
export const DEFAULT_SOAK_MS = 45 * 60 * 1000;
export const MAX_ATTEMPTS = 3;
export const MAX_PRS_PER_RUN = 20;
export const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function nonempty(value) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

/**
 * @param {unknown} body
 * @param {string} label
 * @returns {string | null}
 */
function fieldFromBody(body, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    nonempty(
      String(body ?? '').match(
        new RegExp(`\\*\\*${escaped}:\\*\\*\\s*(\\S+)`)
      )?.[1]
    ) ?? null
  );
}

/**
 * @param {unknown} body
 * @returns {{
 *   issueId: string | null,
 *   fingerprint: string | null,
 *   environment: string | null,
 *   release: string | null,
 *   route: string | null,
 * }}
 */
export function parseAutofixIncident(body) {
  return {
    issueId: fieldFromBody(body, 'Issue ID'),
    fingerprint: fieldFromBody(body, 'Root-cause fingerprint'),
    environment: fieldFromBody(body, 'Environment'),
    release: fieldFromBody(body, 'Release'),
    route: fieldFromBody(body, 'Route'),
  };
}

/**
 * @param {unknown} body
 * @returns {string | null}
 */
export function parseSentryIssueId(body) {
  return parseAutofixIncident(body).issueId;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isProductionEnvironment(value) {
  const env = String(value ?? '')
    .trim()
    .toLowerCase();
  return env === 'vercel-production' || env === 'production' || env === 'prd';
}

/**
 * @param {unknown} value
 * @returns {Record<string, any> | null}
 */
function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, any>} */ (value)
    : null;
}

/**
 * @param {unknown} tags
 * @param {string} key
 * @returns {string | null}
 */
function tagValue(tags, key) {
  if (!Array.isArray(tags)) return null;
  const match = tags.find(tag => {
    const record = asRecord(tag);
    return String(record?.key ?? record?.name ?? '').toLowerCase() === key;
  });
  return nonempty(asRecord(match)?.value);
}

/**
 * @param {unknown} sentryIssue
 * @returns {string | null}
 */
export function sentryIssueFingerprint(sentryIssue) {
  const issue = asRecord(sentryIssue) ?? {};
  return (
    nonempty(issue.root_cause_fingerprint) ||
    nonempty(asRecord(issue.metadata)?.fingerprint) ||
    tagValue(issue.tags, 'root_cause_fingerprint')
  );
}

/**
 * @param {unknown} sentryIssue
 * @returns {string | null}
 */
export function sentryIssueEnvironment(sentryIssue) {
  const issue = asRecord(sentryIssue) ?? {};
  return nonempty(issue.environment) || tagValue(issue.tags, 'environment');
}

/**
 * @param {{
 *   incident?: {
 *     issueId?: string | null,
 *     fingerprint?: string | null,
 *     environment?: string | null,
 *     release?: string | null,
 *   },
 *   sentryIssue?: object | null,
 *   currentMainSha?: string | null,
 *   compare?: { behind_by?: number } | null,
 * }} input
 * @returns {{ action: 'continue' | 'skip', reason: string }}
 */
export function correlateIncident({
  incident = {},
  sentryIssue = null,
  currentMainSha = null,
  compare = null,
} = {}) {
  if (!nonempty(incident.issueId)) {
    return { action: 'skip', reason: 'missing_issue_id' };
  }
  if (!nonempty(incident.environment)) {
    return { action: 'skip', reason: 'missing_environment' };
  }
  if (!isProductionEnvironment(incident.environment)) {
    return { action: 'skip', reason: 'non_production_environment' };
  }
  if (!nonempty(currentMainSha) || !/^[0-9a-f]{40}$/i.test(currentMainSha)) {
    return { action: 'skip', reason: 'missing_current_main' };
  }
  if (
    !compare ||
    typeof compare.behind_by !== 'number' ||
    compare.behind_by > 0
  ) {
    return { action: 'skip', reason: 'not_on_current_main' };
  }

  const sentryEnv = sentryIssueEnvironment(sentryIssue);
  if (sentryEnv && !isProductionEnvironment(sentryEnv)) {
    return { action: 'skip', reason: 'environment_mismatch' };
  }
  if (
    sentryEnv &&
    incident.environment &&
    sentryEnv.toLowerCase() !== String(incident.environment).toLowerCase() &&
    !(
      isProductionEnvironment(sentryEnv) &&
      isProductionEnvironment(incident.environment)
    )
  ) {
    return { action: 'skip', reason: 'environment_mismatch' };
  }

  const sentryFingerprint = sentryIssueFingerprint(sentryIssue);
  if (
    nonempty(incident.fingerprint) &&
    sentryFingerprint &&
    incident.fingerprint !== sentryFingerprint
  ) {
    return { action: 'skip', reason: 'fingerprint_mismatch' };
  }

  return { action: 'continue', reason: 'correlated' };
}

/**
 * @param {{
 *   mergedAt?: string | null,
 *   lastSeen?: string | null,
 *   now?: Date,
 *   soakMs?: number,
 *   issueStatus?: string | null,
 * }} input
 * @returns {{ action: 'resolve' | 'reopen' | 'skip', reason: string }}
 */
export function decideRecurrence({
  mergedAt,
  lastSeen,
  now = new Date(),
  soakMs = DEFAULT_SOAK_MS,
  issueStatus,
} = {}) {
  const merged = mergedAt ? new Date(mergedAt) : null;
  if (!merged || Number.isNaN(merged.getTime())) {
    return { action: 'skip', reason: 'missing_merged_at' };
  }
  if (now.getTime() - merged.getTime() < soakMs) {
    return { action: 'skip', reason: 'soak_pending' };
  }
  if (issueStatus === 'ignored') {
    return { action: 'skip', reason: 'ignored' };
  }
  const seen = lastSeen ? new Date(lastSeen) : null;
  if (!seen || Number.isNaN(seen.getTime())) {
    return { action: 'skip', reason: 'missing_last_seen' };
  }
  if (seen.getTime() > merged.getTime()) {
    return { action: 'reopen', reason: 'still_firing' };
  }
  if (issueStatus === 'resolved') {
    return { action: 'resolve', reason: 'already_resolved_quiet' };
  }
  return { action: 'resolve', reason: 'quiet_after_deploy' };
}

/**
 * @param {unknown[]} comments
 * @param {string} action
 * @param {string | null | undefined} lastSeen
 * @returns {boolean}
 */
export function alreadyRecorded(comments, action, lastSeen) {
  const needle = `sentry-recurrence:${action}:${lastSeen ?? 'none'}`;
  return (Array.isArray(comments) ? comments : []).some(comment =>
    String(comment ?? '').includes(needle)
  );
}

/**
 * @param {{
 *   action: 'resolve' | 'reopen',
 *   lastSeen?: string | null,
 *   issueId?: string | null,
 *   sentryUrl?: string | null,
 *   currentMainSha?: string | null,
 *   reason?: string | null,
 * }} input
 * @returns {string}
 */
export function recurrenceComment({
  action,
  lastSeen,
  issueId,
  sentryUrl,
  currentMainSha,
  reason,
}) {
  const seen = lastSeen ?? 'none';
  const verb = action === 'resolve' ? 'resolved' : 'reopened';
  return `<!-- sentry-recurrence:${verb}:${seen} -->
## Sentry recurrence ${verb}

- **Issue ID:** ${issueId}
- **Last seen:** ${seen}
- **Current main:** ${currentMainSha ?? 'unknown'}
- **Reason:** ${reason ?? verb}
- **Sentry:** ${sentryUrl}

${
  action === 'resolve'
    ? 'No post-deploy recurrence on current main in the soak window. Marked resolved in Sentry.'
    : 'Sentry is still firing after the autofix landed on current main. Reopened the Sentry issue.'
}`;
}

/**
 * @param {number} status
 * @returns {boolean}
 */
export function isRetryableStatus(status) {
  return RETRY_STATUSES.has(status);
}

/**
 * @param {number} attempt
 * @returns {number}
 */
export function retryDelayMs(attempt) {
  return Math.min(1000 * 2 ** (attempt - 1), 4000);
}

/**
 * @param {string} token
 * @param {boolean} [json]
 * @returns {Record<string, string>}
 */
function headers(token, json = false) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: json ? 'application/json' : 'application/vnd.github+json',
    'User-Agent': 'jovie-sentry-autofix-recurrence',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

/**
 * @param {Response} response
 * @returns {Promise<{ ok: boolean, status: number, json: any, text?: string }>}
 */
async function readJson(response) {
  const text = await response.text();
  try {
    return { ok: response.ok, status: response.status, json: JSON.parse(text) };
  } catch {
    return { ok: response.ok, status: response.status, json: null, text };
  }
}

/**
 * @param {string} url
 * @param {RequestInit} init
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   sleepImpl?: (ms: number) => Promise<void>,
 *   maxAttempts?: number,
 * }} [options]
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(
  url,
  init,
  {
    fetchImpl = fetch,
    sleepImpl = ms => new Promise(resolve => setTimeout(resolve, ms)),
    maxAttempts = MAX_ATTEMPTS,
  } = {}
) {
  let last = /** @type {Response | null} */ (null);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    last = await fetchImpl(url, init);
    if (!isRetryableStatus(last.status) || attempt === maxAttempts) {
      return last;
    }
    await sleepImpl(retryDelayMs(attempt));
  }
  return last;
}

/**
 * @param {{
 *   githubToken?: string,
 *   sentryToken?: string,
 *   repository?: string,
 *   soakMs?: number,
 *   now?: Date,
 *   maxPrs?: number,
 *   fetchImpl?: typeof fetch,
 *   sleepImpl?: (ms: number) => Promise<void>,
 * }} [options]
 */
export async function runSentryAutofixRecurrence({
  githubToken = process.env.GH_TOKEN,
  sentryToken = process.env.SENTRY_AUTH_TOKEN,
  repository = process.env.GITHUB_REPOSITORY ?? 'JovieInc/Jovie',
  soakMs = DEFAULT_SOAK_MS,
  now = new Date(),
  maxPrs = MAX_PRS_PER_RUN,
  fetchImpl = fetch,
  sleepImpl = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  if (!githubToken) return { ok: false, reason: 'missing_github_token' };
  if (!sentryToken) return { ok: false, reason: 'missing_sentry_auth_token' };
  if (!Number.isInteger(maxPrs) || maxPrs < 1) {
    return { ok: false, reason: 'invalid_max_prs' };
  }

  const [owner, repo] = String(repository).split('/');
  if (!owner || !repo) return { ok: false, reason: 'invalid_repository' };

  const request = (url, init = {}) =>
    fetchWithRetry(url, init, { fetchImpl, sleepImpl });
  const gh = (path, init = {}) =>
    request(`${GITHUB_API}${path}`, {
      ...init,
      headers: { ...headers(githubToken), ...init.headers },
    });
  const sentry = (path, init = {}) =>
    request(`${SENTRY_API}${path}`, {
      ...init,
      headers: { ...headers(sentryToken, true), ...init.headers },
    });

  const main = await readJson(await gh(`/repos/${owner}/${repo}/commits/main`));
  const currentMainSha = nonempty(main.json?.sha);
  if (!main.ok || !currentMainSha || !/^[0-9a-f]{40}$/i.test(currentMainSha)) {
    return { ok: false, reason: `github_main_${main.status}` };
  }

  const list = await readJson(
    await gh(
      `/search/issues?q=${encodeURIComponent(
        `repo:${owner}/${repo} is:pr is:merged "Sentry autofix" in:title`
      )}&per_page=${maxPrs}&sort=updated`
    )
  );
  if (!list.ok) return { ok: false, reason: `github_search_${list.status}` };
  if (!Array.isArray(list.json?.items)) {
    return { ok: false, reason: 'github_search_malformed' };
  }

  const results = [];
  for (const item of list.json.items.slice(0, maxPrs)) {
    const prNumber = item.number;
    const pr = await readJson(
      await gh(`/repos/${owner}/${repo}/pulls/${prNumber}`)
    );
    if (!pr.ok) {
      results.push({
        pr: prNumber,
        action: 'skip',
        reason: `github_pr_${pr.status}`,
      });
      continue;
    }

    const incident = parseAutofixIncident(pr.json?.body);
    const mergeSha = nonempty(pr.json?.merge_commit_sha);
    const compare = mergeSha
      ? await readJson(
          await gh(
            `/repos/${owner}/${repo}/compare/${mergeSha}...${currentMainSha}`
          )
        )
      : { ok: false, json: null };
    const correlation = correlateIncident({
      incident,
      sentryIssue: null,
      currentMainSha,
      compare: compare.ok ? compare.json : null,
    });
    if (correlation.action === 'skip') {
      results.push({ pr: prNumber, issueId: incident.issueId, ...correlation });
      continue;
    }

    const issue = await readJson(await sentry(`/issues/${incident.issueId}/`));
    if (!issue.ok) {
      results.push({
        pr: prNumber,
        issueId: incident.issueId,
        action: 'skip',
        reason: `sentry_${issue.status}`,
      });
      continue;
    }

    const matched = correlateIncident({
      incident,
      sentryIssue: issue.json,
      currentMainSha,
      compare: compare.ok ? compare.json : null,
    });
    if (matched.action === 'skip') {
      results.push({ pr: prNumber, issueId: incident.issueId, ...matched });
      continue;
    }

    const decision = decideRecurrence({
      mergedAt: pr.json?.merged_at,
      lastSeen: issue.json?.lastSeen,
      issueStatus: issue.json?.status,
      now,
      soakMs,
    });
    if (decision.action === 'skip') {
      results.push({ pr: prNumber, issueId: incident.issueId, ...decision });
      continue;
    }

    const comments = await readJson(
      await gh(
        `/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`
      )
    );
    const bodies = (Array.isArray(comments.json) ? comments.json : []).map(
      comment => comment.body
    );
    const recordedAction =
      decision.action === 'resolve' ? 'resolved' : 'reopened';
    if (alreadyRecorded(bodies, recordedAction, issue.json?.lastSeen)) {
      results.push({
        pr: prNumber,
        issueId: incident.issueId,
        action: 'skip',
        reason: 'already_recorded',
      });
      continue;
    }

    const targetStatus =
      decision.action === 'resolve' ? 'resolved' : 'unresolved';
    const needsUpdate = issue.json?.status !== targetStatus;
    if (needsUpdate) {
      const update = await readJson(
        await sentry(`/issues/${incident.issueId}/`, {
          method: 'PUT',
          body: JSON.stringify({ status: targetStatus }),
        })
      );
      if (!update.ok) {
        results.push({
          pr: prNumber,
          issueId: incident.issueId,
          action: 'skip',
          reason: `sentry_update_${update.status}`,
        });
        continue;
      }
    }

    await gh(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: recurrenceComment({
          action: decision.action,
          lastSeen: issue.json?.lastSeen,
          issueId: incident.issueId,
          sentryUrl: issue.json?.permalink ?? item.html_url,
          currentMainSha,
          reason: decision.reason,
        }),
      }),
    });
    results.push({ pr: prNumber, issueId: incident.issueId, ...decision });
  }

  return { ok: true, currentMainSha, results };
}

async function main() {
  const result = await runSentryAutofixRecurrence({});
  if (!result.ok) throw new Error(result.reason);
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
