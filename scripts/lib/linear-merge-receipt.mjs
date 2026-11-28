#!/usr/bin/env node
/**
 * JOV-13075 reads a closed+merged event from GITHUB_EVENT_PATH and records
 * its receipt in Linear. This writer can advance active work to Merging.
 * The validation lifecycle owns deployment and acceptance.
 * api-budget: linear-requests 860/hr - planned on-demand cap of 10 events/hr, each with at most 21 reads at four attempts and two writes.
 * api-budget: linear-complexity 860000/hr - planning reserve of 1,000 points per request for the paginated issue reads; resize before scheduling.
 */

import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { ApiError } from '../../packages/api-client/client.ts';
import {
  createLinearClient,
  LINEAR_API_URL,
  LinearGraphQLError,
} from '../../packages/api-client/linear.ts';

export const MERGE_RECEIPT_MARKER = 'linear-merge-receipt/v1';
export const TEAM_KEYS = ['JOV', 'LYB', 'SYM'];

export const RECEIPT_STATE_NAME = 'Merging';
const MERGE_PREDECESSORS = new Set(['In Progress', 'In Review']);
export const REVERT_STATE_NAME = {
  JOV: 'Rework',
  SYM: 'Rework',
  LYB: 'In Progress', // LYB has no Rework state.
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
 * @returns {{ number: number, title: string, headRef: string, baseRef: string, url: string, body: string, sha: string, mergedAt: number } | null}
 */
export function readMergeEventPayload(path, read = readFile) {
  if (!path) return null;
  let payload = null;
  try {
    payload = JSON.parse(read(path));
  } catch {
    return null;
  }
  const record = payload?.pull_request;
  if (payload?.action !== 'closed' || record?.merged !== true) return null;
  const number = Number(record.number ?? 0);
  if (!Number.isInteger(number) || number <= 0) return null;
  const mergedAt = Date.parse(String(record.merged_at ?? ''));
  const sha =
    typeof record.merge_commit_sha === 'string' &&
    SHA_RE.test(record.merge_commit_sha)
      ? record.merge_commit_sha
      : '';
  if (!sha || !Number.isFinite(mergedAt)) return null;
  return {
    number,
    title: typeof record.title === 'string' ? record.title : '',
    headRef: typeof record.head?.ref === 'string' ? record.head.ref : '',
    baseRef: typeof record.base?.ref === 'string' ? record.base.ref : '',
    url: typeof record.html_url === 'string' ? record.html_url : '',
    body: typeof record.body === 'string' ? record.body : '',
    sha,
    mergedAt,
  };
}

/**
 * The marker identifies the comment for this PR and merge SHA on replay.
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
  const marker = `<!-- ${MERGE_RECEIPT_MARKER} pr=${number} sha=${sha} -->`;
  return (comments ?? []).some(comment => {
    const body =
      typeof comment === 'string' ? comment : String(comment?.body ?? '');
    return body.split('\n').some(line => line.trim() === marker);
  });
}

/**
 * A revert or failure merge for a linked issue: the pull request title
 * starts with "Revert" or the body names the reverted pull request.
 * @param {{ title?: unknown, body?: unknown }} payload
 * @returns {boolean}
 */
export function isRevertEvent(payload) {
  return (
    /^revert\b/i.test(String(payload?.title ?? '')) ||
    /this reverts pull request/i.test(String(payload?.body ?? ''))
  );
}

const HISTORY_FIELDS = 'createdAt fromState { id } toState { id }';
const PAGE_INFO = 'pageInfo { hasNextPage endCursor }';
const ISSUE_QUERY = `query MergeReceiptIssue($key: String!) {
  issue(id: $key) {
    id
    identifier
    updatedAt
    state { id name type }
    comments(first: 50) { nodes { body } ${PAGE_INFO} }
    history(first: 50) { nodes { ${HISTORY_FIELDS} } ${PAGE_INFO} }
    team { key states { nodes { id name } } }
  }
}`;
const PREIMAGE_QUERY = `query MergeReceiptPreimage($key: String!) {
  issue(id: $key) { id updatedAt state { id } }
}`;

/** @typedef {(query: string, variables: Record<string, unknown>, maxAttempts?: number) => Promise<Record<string, any>>} LinearRequest */

/**
 * @param {LinearRequest} linear
 * @param {string} id
 * @param {'comments' | 'history'} field
 * @param {any} connection
 * @param {(node: any) => boolean} matches
 */
async function issueConnectionMatches(linear, id, field, connection, matches) {
  const fields = field === 'comments' ? 'body' : HISTORY_FIELDS;
  const cursors = new Set();
  for (let page = connection; ; ) {
    if (
      !Array.isArray(page?.nodes) ||
      typeof page?.pageInfo?.hasNextPage !== 'boolean'
    )
      throw new Error(`Incomplete Linear ${field} for ${id}`);
    if (page.nodes.some(matches)) return true;
    if (!page.pageInfo.hasNextPage) return false;
    const after = page.pageInfo.endCursor;
    if (!after || cursors.has(after) || cursors.size >= 9)
      throw new Error(`Incomplete Linear ${field} for ${id}`);
    cursors.add(after);
    const data = await linear(
      `query MergeReceiptPage($id: String!, $after: String!) {
        issue(id: $id) { ${field}(first: 50, after: $after) { nodes { ${fields} } ${PAGE_INFO} } }
      }`,
      { id, after }
    );
    page = data.issue?.[field];
  }
}

/** @param {{ createdAt: string, fromState?: { id: string }, toState?: { id: string } }} entry
 * @param {number} mergedAt */
function stateChangedAfter(entry, mergedAt) {
  if (!entry.fromState?.id && !entry.toState?.id) return false;
  const changedAt = Date.parse(entry.createdAt);
  return !Number.isFinite(changedAt) || changedAt > mergedAt;
}

/** @param {NodeJS.ProcessEnv} env @param {string} message */
function summarize(env, message) {
  try {
    if (env.GITHUB_STEP_SUMMARY)
      appendFileSync(env.GITHUB_STEP_SUMMARY, `- ${message}\n`);
  } catch {
    // A missing summary cannot change the result of a Linear operation.
  }
}

/**
 * Write the merge receipt for a closed+merged pull request event.
 *
 * @param {{
 *   readonly fetchImpl?: typeof fetch,
 *   readonly store?: import('../../packages/api-client/store.ts').LedgerStore,
 *   readonly legacyStateRoot?: string | null,
 *   readonly env?: NodeJS.ProcessEnv,
 *   readonly log?: (message: string) => void,
 *   readonly sleep?: (ms: number) => Promise<void>,
 * }} [options]
 * @returns {Promise<{ action: 'receipt' | 'already' | 'skip', key: string, stateTarget: string }>}
 */
export async function writeLinearMergeReceipt(options = {}) {
  const env = options.env ?? process.env;
  const log = options.log ?? (message => console.log(message));
  /** @param {string} message */
  const report = message => {
    summarize(env, message);
    log(message);
  };
  const payload = readMergeEventPayload(env.GITHUB_EVENT_PATH);
  if (!payload) {
    report(
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
    report(
      `Linear merge receipt: PR #${payload.number} links no JOV/LYB/SYM issue; skipping.`
    );
    return { action: 'skip', key: '', stateTarget: '' };
  }
  const apiKey = env.LINEAR_API_KEY ?? '';
  if (!apiKey) {
    // Fork pull requests do not receive secrets: a visible skip, never a
    // silent drop and never a GitHub-issue fallback.
    report(
      `Linear merge receipt: LINEAR_API_KEY not set for PR #${payload.number} (${key}); skipping. A maintainer run will write the receipt.`
    );
    return { action: 'skip', key, stateTarget: '' };
  }
  const { client } = createLinearClient({
    identity: apiKey,
    authorization: () => apiKey,
    fetch: options.fetchImpl,
    sleep: options.sleep,
    store: options.store,
    legacyStateRoot: options.legacyStateRoot,
  });
  // Reads can retry. An ambiguous write must replay from current Linear state.
  /** @type {LinearRequest} */
  const linear = async (query, variables, maxAttempts = 4) => {
    try {
      const response = await client.request({
        url: LINEAR_API_URL,
        method: 'POST',
        body: { query, variables },
        priority: 'merge',
        maxAttempts,
      });
      if (response.status < 200 || response.status >= 300)
        throw new Error(`Linear HTTP ${response.status}`);
      const payload =
        /** @type {{ errors?: unknown[], data?: Record<string, any> }} */ (
          response.json()
        );
      if (payload.errors?.length) throw new LinearGraphQLError(payload.errors);
      return payload.data ?? {};
    } catch (error) {
      if (error instanceof ApiError && error.status !== null)
        throw new Error(`Linear HTTP ${error.status}: ${error.message}`, {
          cause: error,
        });
      throw error;
    }
  };
  const { issue } = await linear(ISSUE_QUERY, { key });
  if (!issue?.id || issue.identifier !== key) {
    report(
      `Linear merge receipt: no Linear issue ${key} for PR #${payload.number}; skipping.`
    );
    return { action: 'skip', key, stateTarget: '' };
  }
  const exists = await issueConnectionMatches(
    linear,
    issue.id,
    'comments',
    issue.comments,
    comment => hasMergeReceipt([comment], payload.number, payload.sha)
  );
  if (!exists) {
    const written = await linear(
      `mutation WriteMergeReceipt($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) { success }
}`,
      {
        issueId: issue.id,
        body: mergeReceiptBody(payload.number, payload.url, payload.sha),
      },
      1
    );
    if (written.commentCreate?.success !== true)
      throw new Error(`Linear refused the merge receipt for ${key}`);
  }
  // The comment can update updatedAt. Start the state read fence after it.
  const current = exists ? issue : (await linear(ISSUE_QUERY, { key })).issue;
  if (current?.id !== issue.id)
    throw new Error(`Could not reread Linear issue ${key}`);
  const movedTo =
    payload.baseRef === 'main'
      ? await projectMergeState(linear, current, payload)
      : '';
  const message = `Linear merge receipt: ${key} ${exists ? 'already receipted' : 'receipted'} for PR #${payload.number} at ${payload.sha}${movedTo ? ` (state: ${movedTo})` : ''}.`;
  report(message);
  return {
    action: exists && !movedTo ? 'already' : 'receipt',
    key,
    stateTarget: movedTo,
  };
}

/**
 * @param {LinearRequest} linear
 * @param {any} issue
 * @param {NonNullable<ReturnType<typeof readMergeEventPayload>>} payload
 */
async function projectMergeState(linear, issue, payload) {
  const teamKey = String(issue.team?.key ?? '').toUpperCase();
  const reverted = isRevertEvent(payload);
  if (
    !issue.state?.id ||
    !issue.state.type ||
    !issue.updatedAt ||
    !TEAM_KEYS.includes(teamKey)
  )
    throw new Error(`Incomplete Linear state for ${issue.identifier}`);
  if (['canceled', 'duplicate'].includes(issue.state.type)) return '';
  if (!reverted && !MERGE_PREDECESSORS.has(issue.state.name)) return '';
  const targetName = reverted
    ? REVERT_STATE_NAME[/** @type {'JOV' | 'LYB' | 'SYM'} */ (teamKey)]
    : RECEIPT_STATE_NAME;
  if (issue.state.name === targetName) return '';
  const newer = await issueConnectionMatches(
    linear,
    issue.id,
    'history',
    issue.history,
    entry => stateChangedAfter(entry, payload.mergedAt)
  );
  if (newer) return '';
  const target = issue.team.states?.nodes?.find(
    state => state.name === targetName
  );
  if (!target?.id)
    throw new Error(
      `Team ${teamKey} has no '${targetName}' state for ${issue.identifier}`
    );
  const { issue: latest } = await linear(PREIMAGE_QUERY, { key: issue.id });
  if (latest?.id !== issue.id)
    throw new Error(`Could not reread Linear issue ${issue.identifier}`);
  if (
    latest.updatedAt !== issue.updatedAt ||
    latest.state?.id !== issue.state.id
  )
    throw new Error(
      `Linear issue ${issue.identifier} changed before state projection`
    );
  const updated = await linear(
    `mutation MoveMergeReceiptState($issueId: String!, $stateId: String!) {
  issueUpdate(id: $issueId, input: { stateId: $stateId }) { success issue { state { id } } }
}`,
    { issueId: issue.id, stateId: target.id },
    1
  );
  if (
    updated.issueUpdate?.success !== true ||
    updated.issueUpdate?.issue?.state?.id !== target.id
  )
    throw new Error(
      `Linear refused to move ${issue.identifier} to ${targetName}`
    );
  return targetName;
}

/**
 * The visible failure annotation for a Linear receipt that could not land.
 * @param {unknown} error
 * @returns {string}
 */
export function mergeReceiptFailureLog(error) {
  const message =
    error instanceof Error ? error.message : String(error ?? 'unknown failure');
  return `::error::Linear merge receipt failed: ${message} Replay the merge event from current Linear state.`;
}

/**
 * @param {Parameters<typeof writeLinearMergeReceipt>[0]} [options]
 * @param {(message: string) => void} [reportError]
 */
export async function runMergeReceiptCli(
  options = {},
  reportError = console.error
) {
  try {
    await writeLinearMergeReceipt(options);
    return 0;
  } catch (error) {
    const annotation = mergeReceiptFailureLog(error);
    reportError(annotation);
    summarize(options.env ?? process.env, annotation);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await runMergeReceiptCli();

/** @param {string} path @returns {string} */
function readFile(path) {
  return readFileSync(path, 'utf8');
}
