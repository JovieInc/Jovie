#!/usr/bin/env node
/**
 * Close stale needs-human agent PRs only after Slack and Linear are notified.
 *
 * needs-human is an attention + autoclose signal, not a PR Ready / required
 * check. Human and hotfix branches are excluded by the shared agent-branch
 * allowlist.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { isOpenAgentPrBranch } from './agent-branch-pattern.mjs';

export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;
export const LINEAR_API = 'https://api.linear.app/graphql';

/**
 * @typedef {{
 *   readonly ok: boolean,
 *   json: () => Promise<unknown>,
 * }} NotifyResponse
 */

/**
 * @typedef {(
 *   input: string | URL,
 *   init?: { readonly method?: string, readonly headers?: Record<string, string>, readonly body?: string, readonly signal?: AbortSignal }
 * ) => Promise<NotifyResponse>} NotifyFetch
 */

/**
 * @param {unknown} label
 * @returns {string}
 */
export function labelName(label) {
  if (typeof label === 'string') return label;
  if (!label || typeof label !== 'object') return '';
  const name = Reflect.get(label, 'name');
  return typeof name === 'string' ? name : '';
}

/**
 * @param {{ readonly headRefName?: string, readonly body?: string }} input
 * @returns {string}
 */
export function extractLinearIdentifier(input = {}) {
  const body = typeof input.body === 'string' ? input.body : '';
  const headRefName =
    typeof input.headRefName === 'string' ? input.headRefName : '';
  const fromBody =
    /linear-issue-(?:id|identifier):([A-Za-z0-9-]+)/i.exec(body)?.[1] ?? '';
  if (/^JOV-\d+$/i.test(fromBody)) return fromBody.toUpperCase();
  const fromBranch = /jov-(\d+)/i.exec(headRefName)?.[1];
  return fromBranch ? `JOV-${fromBranch}` : '';
}

/**
 * @param {unknown} pr
 * @returns {boolean}
 */
export function hasNeedsHumanLabel(pr) {
  if (!pr || typeof pr !== 'object') return false;
  const labels = /** @type {{ labels?: unknown }} */ (pr).labels;
  if (!Array.isArray(labels)) return false;
  return labels.some(label => labelName(label) === 'needs-human');
}

/**
 * @param {unknown} prs
 * @param {{ readonly now?: number, readonly maxAgeMs?: number }} [options]
 * @returns {object[]}
 */
export function selectStaleNeedsHumanAgentPrs(prs, options = {}) {
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? STALE_AFTER_MS;
  if (!Array.isArray(prs)) return [];

  return prs.filter(pr => {
    if (!pr || typeof pr !== 'object') return false;
    const record =
      /** @type {{ headRefName?: unknown, updatedAt?: unknown }} */ (pr);
    if (!isOpenAgentPrBranch(record.headRefName)) return false;
    if (!hasNeedsHumanLabel(pr)) return false;
    const updated = Date.parse(String(record.updatedAt ?? ''));
    if (!Number.isFinite(updated)) return false;
    return now - updated >= maxAgeMs;
  });
}

/**
 * Slack is always required. Linear is required only when an identifier exists.
 * @param {{
 *   readonly slackOk: boolean,
 *   readonly linearIdentifier?: string,
 *   readonly linearOk?: boolean,
 * }} input
 * @returns {boolean}
 */
export function canCloseAfterNotify(input) {
  if (input.slackOk !== true) return false;
  if (input.linearIdentifier && input.linearOk !== true) return false;
  return true;
}

/**
 * @param {{
 *   readonly number: number,
 *   readonly title: string,
 *   readonly headRefName: string,
 *   readonly htmlUrl?: string,
 * }} pr
 * @returns {string}
 */
export function buildNotifyText(pr) {
  const url = pr.htmlUrl ?? `#${pr.number}`;
  return [
    `needs-human agent PR #${pr.number} is stale (>48h) and will be auto-closed.`,
    `Title: ${pr.title}`,
    `Branch: ${pr.headRefName}`,
    `URL: ${url}`,
    'needs-human is not a merge blocker; this is an attention notice before close.',
  ].join('\n');
}

/**
 * @param {string} webhookUrl
 * @param {string} text
 * @param {NotifyFetch} [fetchImpl]
 * @returns {Promise<boolean>}
 */
export async function notifySlack(webhookUrl, text, fetchImpl = fetch) {
  const webhook = webhookUrl.trim();
  if (!webhook) return false;
  try {
    const response = await fetchImpl(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 4000) }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   readonly apiKey: string,
 *   readonly identifier: string,
 *   readonly text: string,
 *   readonly fetchImpl?: NotifyFetch,
 * }} input
 * @returns {Promise<boolean>}
 */
export async function notifyLinear(input) {
  const apiKey = input.apiKey.trim();
  const identifier = input.identifier.trim();
  if (!apiKey || !identifier) return false;
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const lookup = await fetchImpl(LINEAR_API, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'query Issue($id: String!) { issue(id: $id) { id identifier } }',
        variables: { id: identifier },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!lookup.ok) return false;
    const lookupJson = /** @type {{ data?: { issue?: { id?: string } } }} */ (
      await lookup.json()
    );
    const issueId = lookupJson.data?.issue?.id;
    if (!issueId) return false;

    const comment = await fetchImpl(LINEAR_API, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query:
          'mutation Comment($id: String!, $body: String!) { commentCreate(input: { issueId: $id, body: $body }) { success } }',
        variables: { id: issueId, body: input.text },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!comment.ok) return false;
    const commentJson =
      /** @type {{ data?: { commentCreate?: { success?: boolean } } }} */ (
        await comment.json()
      );
    return commentJson.data?.commentCreate?.success === true;
  } catch {
    return false;
  }
}

/**
 * @param {number} number
 * @param {string} comment
 */
function defaultClosePr(number, comment) {
  execFileSync('gh', ['pr', 'close', String(number), '--comment', comment], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

/**
 * @param {string} args
 * @returns {string}
 */
function defaultGhJson(args) {
  return execFileSync('gh', args.split(' ').filter(Boolean), {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

/**
 * @param {{
 *   readonly slackWebhookUrl?: string,
 *   readonly linearApiKey?: string,
 *   readonly now?: number,
 *   readonly ghJson?: (args: string) => string,
 *   readonly closePr?: (number: number, comment: string) => void,
 *   readonly fetchImpl?: NotifyFetch,
 *   readonly log?: (message: string) => void,
 * }} [deps]
 * @returns {Promise<{ closed: number[], skipped: number[] }>}
 */
export async function closeStaleNeedsHumanAgentPrs(deps = {}) {
  const slackWebhookUrl =
    deps.slackWebhookUrl ?? process.env.SLACK_WEBHOOK_URL ?? '';
  const linearApiKey = deps.linearApiKey ?? process.env.LINEAR_API_KEY ?? '';
  const log = deps.log ?? console.log;
  const ghJson = deps.ghJson ?? defaultGhJson;
  const closePr = deps.closePr ?? defaultClosePr;
  const listed = JSON.parse(
    ghJson(
      'pr list --state open --label needs-human --limit 50 --json number,title,headRefName,updatedAt,body,url'
    ) || '[]'
  );
  const stale = selectStaleNeedsHumanAgentPrs(listed, { now: deps.now });
  if (stale.length === 0) {
    log('No stale agent PRs found');
    return { closed: [], skipped: [] };
  }

  /** @type {number[]} */
  const closed = [];
  /** @type {number[]} */
  const skipped = [];

  for (const pr of stale) {
    const record = /** @type {{
      number: number,
      title: string,
      headRefName: string,
      body?: string,
      url?: string,
    }} */ (pr);
    const linearIdentifier = extractLinearIdentifier({
      headRefName: record.headRefName,
      body: record.body ?? '',
    });
    const text = buildNotifyText({
      number: record.number,
      title: record.title,
      headRefName: record.headRefName,
      htmlUrl: record.url,
    });
    const slackOk = await notifySlack(slackWebhookUrl, text, deps.fetchImpl);
    const linearOk = linearIdentifier
      ? await notifyLinear({
          apiKey: linearApiKey,
          identifier: linearIdentifier,
          text,
          fetchImpl: deps.fetchImpl,
        })
      : true;

    if (!canCloseAfterNotify({ slackOk, linearIdentifier, linearOk })) {
      log(
        `Skipping close for #${record.number}: Slack/Linear notify did not succeed first`
      );
      skipped.push(record.number);
      continue;
    }

    const linearNote = linearIdentifier
      ? `Notified Linear ${linearIdentifier} before close.`
      : 'No Linear identifier found on the branch or PR body.';
    closePr(
      record.number,
      `## Auto-Closed: Stale Agent PR

This PR has been labeled \`needs-human\` for over 48 hours with no activity.

Slack and Linear were notified before close. \`needs-human\` is not a merge blocker.

Closing to keep the PR queue clean. The branch has not been deleted.

${linearNote}

To reopen: \`gh pr reopen ${record.number}\` or create a fresh PR from main.`
    );
    log(`Closed stale PR #${record.number}: ${record.title}`);
    closed.push(record.number);
  }

  return { closed, skipped };
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  closeStaleNeedsHumanAgentPrs().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
