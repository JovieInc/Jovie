#!/usr/bin/env node
/**
 * Linear merge receipt writer (JOV-13075): a standalone, deterministic
 * receipt hop for merged pull requests, separate from the validation
 * lifecycle writer (linear-sync-on-merge.mjs / sync_done), which is being
 * retired behind the JOV-13076 kill switch.
 *
 * Input: a pull_request closed+merged event payload (GITHUB_EVENT_PATH).
 * Link resolution precedence: explicit markers first, then the PR title,
 * then a jov-N/lyb-N/sym-N branch, then a `Refs <KEY>-N` body line. An
 * empty `Refs JOV-` template links nothing.
 *
 * It writes ONE Linear comment under a stable marker carrying the PR
 * number, PR URL and 40-character merge SHA, and moves the issue to the
 * team's merged state. Replayed events recognize their own marker and
 * write nothing. It writes to Linear only and never writes back to
 * GitHub; a Linear failure retries with backoff and then fails the run
 * visibly (::error annotation + step summary) — no silent drop and no
 * GitHub-issue fallback. A run without LINEAR_API_KEY (fork pull
 * requests) skips visibly with exit 0.
 */

import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const LINEAR_API = 'https://api.linear.app/graphql';
export const MERGE_RECEIPT_MARKER = 'linear-merge-receipt/v1';
/** Teams whose issues this writer receipts. */
export const TEAM_KEYS = ['JOV', 'LYB', 'SYM'];
/** The per-team state a merged pull request lands in. A team without a
 * state of this name gets the receipt comment without the state move. */
export const TEAM_MERGED_STATE_NAME = {
  JOV: 'Merging',
  LYB: 'Merging',
  SYM: 'Merging',
};

const KEY_TOKEN_RE = /^(JOV|LYB|SYM)-([1-9]\d*)$/i;
const TITLE_KEY_RE = /\b((?:JOV|LYB|SYM)-[1-9]\d*)(?![A-Za-z0-9-])/i;
const BRANCH_KEY_RE = /(?:^|[^A-Za-z0-9])((?:jov|lyb|sym)-[1-9]\d*)(?!\d)/i;
const REFS_LINE_RE =
  /^[ \t]*refs:?[ \t]+(?:\S+[ \t]+)*?((?:JOV|LYB|SYM)-[1-9]\d*)(?![A-Za-z0-9-])/im;
const SHA_RE = /^[0-9a-f]{40}$/;

/**
 * @param {unknown} token
 * @returns {string} Uppercase TEAM-N for a team key this writer receipts, else ''.
 */
function normalizeKeyToken(token) {
  return KEY_TOKEN_RE.test(String(token ?? ''))
    ? String(token).toUpperCase()
    : '';
}

/**
 * Link resolution precedence (JOV-13075): explicit markers first, then the
 * PR title, then a jov-N/lyb-N/sym-N branch, then a `Refs <KEY>-N` body
 * line. An empty template `Refs JOV-` matches nothing and links nothing.
 *
 * @param {{
 *   readonly body?: unknown,
 *   readonly title?: unknown,
 *   readonly headRef?: unknown,
 * }} input
 * @returns {string} TEAM-N or '' when the pull request links no issue.
 */
export function extractReceiptKey(input = {}) {
  const body = String(input.body ?? '');
  const identifierMarker =
    /linear-issue-identifier:\s*([A-Za-z0-9-]+)/i.exec(body)?.[1] ?? '';
  const idMarker = /linear-issue-id:\s*([A-Za-z0-9-]+)/i.exec(body)?.[1] ?? '';
  const summerIdentifier =
    /<!--\s*summer-issue-bind\s*-->\s*((?:JOV|LYB|SYM)-[1-9]\d*)(?![A-Za-z0-9-])/i.exec(
      body
    )?.[1] ?? '';
  const branchKey = BRANCH_KEY_RE.exec(String(input.headRef ?? ''))?.[1] ?? '';
  const refsKey = REFS_LINE_RE.exec(body)?.[1] ?? '';
  return (
    normalizeKeyToken(identifierMarker) ||
    normalizeKeyToken(idMarker) ||
    normalizeKeyToken(summerIdentifier) ||
    normalizeKeyToken(TITLE_KEY_RE.exec(String(input.title ?? ''))?.[1]) ||
    normalizeKeyToken(branchKey) ||
    normalizeKeyToken(refsKey)
  );
}

/**
 * @param {string | undefined} path
 * @param {(path: string) => string} [read]
 * @returns {{ number: number, title: string, headRef: string, url: string, body: string, sha: string } | null}
 */
export function readMergeEventPayload(path, read = readFile) {
  if (!path) return null;
  let payload = null;
  try {
    payload = JSON.parse(read(path));
  } catch {
    return null;
  }
  const pull =
    payload && typeof payload === 'object'
      ? /** @type {{ pull_request?: unknown }} */ (payload).pull_request
      : null;
  const record =
    pull && typeof pull === 'object'
      ? /** @type {{ number?: unknown, title?: unknown, html_url?: unknown, merge_commit_sha?: unknown, body?: unknown, head?: { ref?: unknown } }} */ (
          pull
        )
      : {};
  const number = Number(record.number ?? 0);
  if (!Number.isInteger(number) || number <= 0) return null;
  const head =
    record.head && typeof record.head === 'object'
      ? /** @type {{ ref?: unknown }} */ (record.head)
      : {};
  const sha =
    typeof record.merge_commit_sha === 'string' &&
    SHA_RE.test(record.merge_commit_sha)
      ? record.merge_commit_sha
      : '';
  if (!sha) return null;
  return {
    number,
    title: typeof record.title === 'string' ? record.title : '',
    headRef: typeof head.ref === 'string' ? head.ref : '',
    url: typeof record.html_url === 'string' ? record.html_url : '',
    body: typeof record.body === 'string' ? record.body : '',
    sha,
  };
}

/**
 * The receipt comment. The HTML marker carries pr + sha so a replayed merge
 * event can recognize its own earlier comment and write nothing.
 * @param {number} number
 * @param {string} url
 * @param {string} sha
 * @returns {string}
 */
export function mergeReceiptBody(number, url, sha) {
  return [
    `<!-- ${MERGE_RECEIPT_MARKER} pr=${number} sha=${sha} -->`,
    `Merged #${number} at ${sha}${url ? ` — ${url}` : ''}.`,
  ].join('\n');
}

/**
 * True when this exact merge (pr + sha) already has its receipt comment.
 * @param {readonly (string | { readonly body?: string })[]} comments
 * @param {number} number
 * @param {string} sha
 * @returns {boolean}
 */
export function hasMergeReceipt(comments, number, sha) {
  const needle = `${MERGE_RECEIPT_MARKER} pr=${number} sha=${sha}`;
  return (comments ?? []).some(comment =>
    typeof comment === 'string'
      ? comment.includes(needle)
      : String(comment?.body ?? '').includes(needle)
  );
}

/**
 * Bounded-retry fetch for the Linear GraphQL API: transient 5xx/429s retry
 * with exponential backoff (maxAttempts total tries), everything else
 * throws immediately so the caller can fail the run visibly.
 *
 * @param {HttpFetch} fetchImpl
 * @param {string} apiKey
 * @param {string} query
 * @param {Record<string, unknown>} variables
 * @param {(ms: number) => Promise<void>} sleep
 * @returns {Promise<Record<string, any>>}
 */
async function linearGraphql(fetchImpl, apiKey, query, variables, sleep) {
  const maxAttempts = 4;
  /** @type {Error | null} */
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    /** @type {any} */
    let response = null;
    try {
      response = await fetchImpl(LINEAR_API, {
        method: 'POST',
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(String(error ?? 'fetch failed'));
    }
    if (response && response.ok) {
      const payload =
        /** @type {{ errors?: unknown, data?: Record<string, any> }} */ (
          await response.json()
        );
      if (Array.isArray(payload.errors) && payload.errors.length > 0) {
        throw new Error(
          payload.errors
            .map(error =>
              error && typeof error === 'object' && 'message' in error
                ? String(error.message)
                : 'Linear request failed'
            )
            .join('; ')
        );
      }
      return payload.data ?? {};
    }
    const status = response ? response.status : 0;
    const retryable = !response || status === 429 || status >= 500;
    lastError = new Error(`Linear HTTP ${status || 'transport error'}`);
    if (!retryable || attempt === maxAttempts) throw lastError;
    await sleep(Math.min(8_000, 2 ** (attempt - 1) * 250));
  }
  throw lastError ?? new Error('Linear request failed');
}

/**
 * @param {HttpFetch} fetchImpl
 * @param {string} apiKey
 * @param {string} key
 * @param {(ms: number) => Promise<void>} sleep
 * @returns {Promise<{ id: string, identifier: string, state: { id: string, name: string }, comments: { nodes: { body: string }[] }, team: { key: string, states: { nodes: { id: string, name: string }[] } } } | null>}
 */
async function readReceiptIssue(fetchImpl, apiKey, key, sleep) {
  const data = await linearGraphql(
    fetchImpl,
    apiKey,
    `query MergeReceiptIssue($key: String!) {
  issue(id: $key) {
    id
    identifier
    state { id name }
    comments(first: 50) { nodes { body } }
    team { key states { nodes { id name } } }
  }
}`,
    { key },
    sleep
  );
  return data.issue ?? null;
}

/**
 * Write the merge receipt for a closed+merged pull request event.
 *
 * @param {{
 *   readonly fetchImpl?: HttpFetch,
 *   readonly env?: NodeJS.ProcessEnv,
 *   readonly log?: (message: string) => void,
 *   readonly sleep?: (ms: number) => Promise<void>,
 * }} [options]
 * @returns {Promise<{ action: 'receipt' | 'already' | 'skip', key: string, stateTarget: string }>}
 */
export async function writeLinearMergeReceipt(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const env = options.env ?? process.env;
  const log = options.log ?? (message => console.log(message));
  const sleep =
    options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const summarize = message => {
    try {
      if (env.GITHUB_STEP_SUMMARY)
        appendFileSync(env.GITHUB_STEP_SUMMARY, `- ${message}\n`);
    } catch {
      // Visibility must never turn a skip into a crash.
    }
  };
  const payload = readMergeEventPayload(env.GITHUB_EVENT_PATH);
  if (!payload) {
    summarize(
      'Linear merge receipt: no usable closed+merged pull request payload; skipping.'
    );
    log(
      'Linear merge receipt: no usable closed+merged pull request payload; skipping'
    );
    return { action: 'skip', key: '', stateTarget: '' };
  }
  const key = extractReceiptKey({
    body: payload.body,
    title: payload.title,
    headRef: payload.headRef,
  });
  if (!key) {
    summarize(
      `Linear merge receipt: PR #${payload.number} links no JOV/LYB/SYM issue; skipping.`
    );
    log(
      `Linear merge receipt: PR #${payload.number} links no JOV/LYB/SYM issue; skipping`
    );
    return { action: 'skip', key: '', stateTarget: '' };
  }
  const apiKey = env.LINEAR_API_KEY ?? '';
  if (!apiKey) {
    // Fork pull requests do not receive secrets: a visible skip, never a
    // silent drop and never a GitHub-issue fallback.
    summarize(
      `Linear merge receipt: LINEAR_API_KEY not set for PR #${payload.number} (${key}); skipping. A maintainer run will write the receipt.`
    );
    log(`Linear merge receipt: LINEAR_API_KEY not set; skipping (${key})`);
    return { action: 'skip', key, stateTarget: '' };
  }
  const issue = await readReceiptIssue(fetchImpl, apiKey, key, sleep);
  if (!issue?.id) {
    summarize(
      `Linear merge receipt: no Linear issue ${key} for PR #${payload.number}; skipping.`
    );
    log(`Linear merge receipt: no Linear issue ${key}; skipping`);
    return { action: 'skip', key, stateTarget: '' };
  }
  if (
    hasMergeReceipt(issue.comments?.nodes ?? [], payload.number, payload.sha)
  ) {
    log(
      `Linear merge receipt: ${key} already has the receipt for PR #${payload.number} at ${payload.sha}; nothing to do`
    );
    return { action: 'already', key, stateTarget: '' };
  }
  await linearGraphql(
    fetchImpl,
    apiKey,
    `mutation WriteMergeReceipt($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) { success }
}`,
    {
      issueId: issue.id,
      body: mergeReceiptBody(payload.number, payload.url, payload.sha),
    },
    sleep
  );
  const teamKey = String(issue.team?.key ?? '').toUpperCase();
  const stateTarget =
    TEAM_MERGED_STATE_NAME[teamKey] ?? TEAM_MERGED_STATE_NAME.JOV;
  const target = (issue.team?.states?.nodes ?? []).find(
    state => state.name === stateTarget
  );
  let movedTo = '';
  if (!target?.id) {
    log(
      `Linear merge receipt: team ${teamKey} has no '${stateTarget}' state; receipt written without a state move`
    );
  } else if (issue.state?.id === target.id) {
    movedTo = target.name;
  } else {
    const updated = await linearGraphql(
      fetchImpl,
      apiKey,
      `mutation MoveMergeReceiptState($issueId: String!, $stateId: String!) {
  issueUpdate(id: $issueId, input: { stateId: $stateId }) { success issue { state { name } } }
}`,
      { issueId: issue.id, stateId: target.id },
      sleep
    );
    movedTo = String(updated.issueUpdate?.issue?.state?.name ?? target.name);
  }
  summarize(
    `Linear merge receipt: ${key} receipted for PR #${payload.number} at ${payload.sha}${movedTo ? `; state moved to ${movedTo}` : ''}.`
  );
  log(
    `Linear merge receipt: ${key} receipted for PR #${payload.number}${movedTo ? `; state moved to ${movedTo}` : ''}`
  );
  return { action: 'receipt', key, stateTarget: movedTo };
}

/**
 * The visible failure annotation for a Linear receipt that could not land.
 * @param {unknown} error
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function mergeReceiptFailureLog(error, env = process.env) {
  const message =
    error instanceof Error ? error.message : String(error ?? 'unknown failure');
  return `::error::Linear merge receipt failed: ${message} The merge event will not be re-delivered; re-run the workflow or evaluate the issue manually.`;
}

/** CLI entry: `node scripts/lib/linear-merge-receipt.mjs`. */
const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  writeLinearMergeReceipt().catch(error => {
    const annotation = mergeReceiptFailureLog(error);
    console.error(annotation);
    try {
      if (process.env.GITHUB_STEP_SUMMARY)
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `- Linear merge receipt FAILED: ${error instanceof Error ? error.message : String(error)}; the receipt did not land and no GitHub issue was touched.\n`
        );
    } catch {
      // Visibility must never turn a failure into a crash.
    }
    process.exitCode = 1;
  });
}

/**
 * @typedef {{
 *   (input: string | URL | Request, init?: RequestInit): Promise<
 *     | Response
 *     | { ok: boolean, status?: number, json: () => Promise<unknown>, headers?: { get?: (name: string) => string | null } }
 *   >;
 * }} HttpFetch
 */

/** @param {string} path @returns {string} */
function readFile(path) {
  return readFileSync(path, 'utf8');
}
