#!/usr/bin/env node
/**
 * Move a Linear issue to Done after a PR merges, unless linked work is still
 * open or the issue is a commissioning parent.
 *
 * Linked means a linear-issue-id / linear-issue-identifier marker in the PR
 * body, a jov-NNNN branch reference, or the identifier in the title.
 * Commissioning parents are detected by label, sub-issues, or the allowlist.
 */

import { pathToFileURL } from 'node:url';

export const LINEAR_API = 'https://api.linear.app/graphql';
export const COMMISSIONING_PARENT_ALLOWLIST = new Set(['JOV-5853']);

const IDENTIFIER_RE = /^JOV-(\d+)$/i;
const COMMISSIONING_LABEL_RE = /commission/i;
const PARENT_LABEL_RE = /^(parent|epic)$/i;
const MAX_OPEN_PR_PAGES = 20;

/**
 * @param {unknown} label
 * @returns {string}
 */
function labelName(label) {
  if (typeof label === 'string') return label;
  if (!label || typeof label !== 'object') return '';
  const name = Reflect.get(label, 'name');
  return typeof name === 'string' ? name : '';
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function linearIdentifierFromText(value) {
  const match = /(?:^|[^A-Za-z0-9])jov-(\d+)(?!\d)/i.exec(String(value ?? ''));
  return match ? `JOV-${match[1]}` : '';
}

/**
 * @param {{
 *   readonly body?: string,
 *   readonly headRef?: string,
 * }} input
 * @returns {{ identifier: string, issueId: string }}
 */
export function extractMergeIssueRef(input = {}) {
  const body = String(input.body ?? '');
  const identifierMarker =
    /linear-issue-identifier:\s*([A-Za-z0-9-]+)/i.exec(body)?.[1] ?? '';
  const idMarker = /linear-issue-id:\s*([A-Za-z0-9-]+)/i.exec(body)?.[1] ?? '';
  const identifier = IDENTIFIER_RE.test(identifierMarker)
    ? identifierMarker.toUpperCase()
    : IDENTIFIER_RE.test(idMarker)
      ? idMarker.toUpperCase()
      : linearIdentifierFromText(input.headRef);
  const issueId =
    idMarker && !IDENTIFIER_RE.test(idMarker) ? idMarker : identifier;
  return { identifier, issueId };
}

/**
 * @param {unknown} pull
 * @returns {{
 *   number: number,
 *   title: string,
 *   body: string,
 *   state: string,
 *   draft: boolean,
 *   headRef: string,
 *   url: string,
 * }}
 */
export function normalizePullRequest(pull) {
  const record =
    pull && typeof pull === 'object'
      ? /** @type {Record<string, unknown>} */ (pull)
      : {};
  const head =
    record.head && typeof record.head === 'object'
      ? /** @type {{ ref?: unknown }} */ (record.head)
      : {};
  const number = Number(record.number);
  return {
    number: Number.isInteger(number) ? number : 0,
    title: typeof record.title === 'string' ? record.title : '',
    body: typeof record.body === 'string' ? record.body : '',
    state: String(record.state ?? '').toLowerCase(),
    draft: record.draft === true || record.isDraft === true,
    headRef:
      typeof head.ref === 'string'
        ? head.ref
        : typeof record.headRef === 'string'
          ? record.headRef
          : typeof record.headRefName === 'string'
            ? record.headRefName
            : '',
    url:
      typeof record.html_url === 'string'
        ? record.html_url
        : typeof record.url === 'string'
          ? record.url
          : '',
  };
}

/**
 * @param {{ readonly state?: string, readonly draft?: boolean }} pull
 * @returns {boolean}
 */
export function isOpenOrDraft(pull) {
  const state = String(pull.state ?? '').toLowerCase();
  if (state === 'closed' || state === 'merged') return false;
  if (state === 'open') return true;
  return pull.draft === true;
}

/**
 * @param {{
 *   readonly title?: string,
 *   readonly body?: string,
 *   readonly headRef?: string,
 * }} pull
 * @param {{ readonly identifier?: string, readonly issueId?: string }} issue
 * @returns {boolean}
 */
export function pullRequestLinksIssue(pull, issue) {
  const identifier = String(issue.identifier ?? '').toUpperCase();
  const issueId = String(issue.issueId ?? '');
  const numberMatch = IDENTIFIER_RE.exec(identifier);
  const number = numberMatch ? numberMatch[1] : '';
  const title = pull.title ?? '';
  const body = pull.body ?? '';
  const branch = pull.headRef ?? '';
  if (identifier && new RegExp(`\\b${identifier}\\b`, 'i').test(title)) {
    return true;
  }
  if (
    number &&
    new RegExp(`(?:^|[^A-Za-z0-9])jov-${number}(?!\\d)`, 'i').test(branch)
  ) {
    return true;
  }
  const idMarkers = [
    ...body.matchAll(/linear-issue-id:\s*([A-Za-z0-9-]+)/gi),
  ].map(match => match[1]);
  const identifierMarkers = [
    ...body.matchAll(/linear-issue-identifier:\s*([A-Za-z0-9-]+)/gi),
  ].map(match => match[1].toUpperCase());
  if (issueId && idMarkers.includes(issueId)) return true;
  if (identifier && identifierMarkers.includes(identifier)) return true;
  return idMarkers.some(marker => marker.toUpperCase() === identifier);
}

/**
 * @param {unknown} issue
 * @returns {{
 *   id: string,
 *   identifier: string,
 *   labels: string[],
 *   children: string[],
 *   hasChildren: boolean,
 *   states: { id?: string, name?: string, type?: string }[],
 * }}
 */
export function readIssueSnapshot(issue) {
  const record =
    issue && typeof issue === 'object'
      ? /** @type {Record<string, unknown>} */ (issue)
      : {};
  const labelNodes = Array.isArray(record.labels)
    ? record.labels
    : record.labels &&
        typeof record.labels === 'object' &&
        Array.isArray(/** @type {{ nodes?: unknown }} */ (record.labels).nodes)
      ? /** @type {{ nodes: unknown[] }} */ (record.labels).nodes
      : [];
  const childNodes = Array.isArray(record.children)
    ? record.children
    : record.children &&
        typeof record.children === 'object' &&
        Array.isArray(
          /** @type {{ nodes?: unknown }} */ (record.children).nodes
        )
      ? /** @type {{ nodes: unknown[] }} */ (record.children).nodes
      : [];
  const team =
    record.team && typeof record.team === 'object'
      ? /** @type {{ states?: { nodes?: unknown } }} */ (record.team)
      : {};
  const states = Array.isArray(team.states?.nodes) ? team.states.nodes : [];
  const children = childNodes
    .map(child => {
      if (typeof child === 'string') return child.toUpperCase();
      if (!child || typeof child !== 'object') return '';
      const identifier = Reflect.get(child, 'identifier');
      return typeof identifier === 'string' ? identifier.toUpperCase() : '';
    })
    .filter(identifier => IDENTIFIER_RE.test(identifier));
  return {
    id: typeof record.id === 'string' ? record.id : '',
    identifier:
      typeof record.identifier === 'string'
        ? record.identifier.toUpperCase()
        : '',
    labels: labelNodes.map(labelName).filter(Boolean),
    children,
    hasChildren: childNodes.length > 0,
    states: states.filter(state => state && typeof state === 'object'),
  };
}

/**
 * @param {{
 *   readonly identifier?: string,
 *   readonly labels?: readonly string[],
 *   readonly children?: readonly string[],
 *   readonly hasChildren?: boolean,
 * }} issue
 * @param {ReadonlySet<string>} [allowlist]
 * @returns {string}
 */
export function parentHoldReason(
  issue,
  allowlist = COMMISSIONING_PARENT_ALLOWLIST
) {
  const identifier = String(issue.identifier ?? '').toUpperCase();
  const signals = [];
  if (identifier && allowlist.has(identifier)) signals.push('allowlist');
  const labels = (issue.labels ?? []).filter(
    name => COMMISSIONING_LABEL_RE.test(name) || PARENT_LABEL_RE.test(name)
  );
  if (labels.length > 0) signals.push(`label ${labels.join(', ')}`);
  const children = issue.children ?? [];
  if (issue.hasChildren || children.length > 0) {
    signals.push(
      children.length > 0
        ? `sub-issues ${children.slice(0, 10).join(', ')}`
        : 'sub-issues present'
    );
  }
  if (signals.length === 0) return '';
  return `${identifier} is a commissioning or parent issue (${signals.join('; ')}) and stays open when a child pull request merges.`;
}

/**
 * @param {readonly { number: number, draft?: boolean }[]} pulls
 * @returns {string}
 */
function formatBlockingPulls(pulls) {
  const shown = pulls
    .slice(0, 20)
    .map(pull => `#${pull.number}${pull.draft ? ' (draft)' : ''}`);
  const extra = pulls.length > 20 ? ` and ${pulls.length - 20} more` : '';
  return `Linked pull requests still open or draft: ${shown.join(', ')}${extra}.`;
}

/**
 * @param {{ id?: string, name?: string, type?: string }[]} states
 * @returns {string}
 */
export function selectDoneStateId(states) {
  const match = (states ?? []).find(state => {
    const type = String(state?.type ?? '');
    const name = String(state?.name ?? '');
    return type === 'completed' || /done|completed/i.test(name);
  });
  return typeof match?.id === 'string' ? match.id : '';
}

/**
 * @param {string | null | undefined} header
 * @returns {string}
 */
export function nextLink(header) {
  if (!header) return '';
  for (const part of header.split(',')) {
    const match = /<([^>]+)>;\s*rel="next"/i.exec(part);
    if (match) return match[1];
  }
  return '';
}

/**
 * @param {{
 *   readonly issue: {
 *     readonly id?: string,
 *     readonly identifier?: string,
 *     readonly labels?: readonly string[],
 *     readonly children?: readonly string[],
 *     readonly hasChildren?: boolean,
 *   },
 *   readonly pullRequests: readonly object[],
 *   readonly mergingPull: { readonly number: number, readonly url: string, readonly sha: string },
 *   readonly allowlist?: ReadonlySet<string>,
 *   readonly scanComplete?: boolean,
 * }} input
 * @returns {{ action: 'close' | 'skip', comment: string, blockingNumbers: number[] }}
 */
export function decideLinearCloseOnMerge(input) {
  const identifier = String(input.issue.identifier ?? '').toUpperCase();
  const mergingNumber = Number(input.mergingPull.number);
  const blocking = input.pullRequests
    .map(normalizePullRequest)
    .filter(pull => pull.number > 0 && pull.number !== mergingNumber)
    .filter(isOpenOrDraft)
    .filter(pull =>
      pullRequestLinksIssue(pull, {
        identifier,
        issueId: input.issue.id,
      })
    )
    .sort((left, right) => left.number - right.number);
  const reasons = [];
  const parent = parentHoldReason(input.issue, input.allowlist);
  if (parent) reasons.push(parent);
  if (blocking.length > 0) reasons.push(formatBlockingPulls(blocking));
  if (input.scanComplete === false) {
    reasons.push(
      'The open pull request scan stopped before the last page, so the issue was left open.'
    );
  }
  const lead = `Did not mark ${identifier} Done after ${input.mergingPull.url} merged (merge SHA: ${input.mergingPull.sha}).`;
  if (reasons.length > 0) {
    return {
      action: 'skip',
      comment: [lead, ...reasons].join('\n'),
      blockingNumbers: blocking.map(pull => pull.number),
    };
  }
  return {
    action: 'close',
    comment: `PR merged for ${identifier}: ${input.mergingPull.url} (merge SHA: ${input.mergingPull.sha})`,
    blockingNumbers: [],
  };
}

/**
 * @param {typeof fetch} fetchImpl
 * @param {string} apiKey
 * @param {string} query
 * @param {Record<string, unknown>} variables
 */
async function linearGraphql(fetchImpl, apiKey, query, variables) {
  const response = await fetchImpl(LINEAR_API, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`Linear HTTP ${response.status}`);
  }
  const payload = await response.json();
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

/**
 * @param {{
 *   readonly fetchImpl: typeof fetch,
 *   readonly token: string,
 *   readonly repository: string,
 *   readonly maxPages?: number,
 * }} input
 */
export async function listOpenPullRequests(input) {
  const maxPages = input.maxPages ?? MAX_OPEN_PR_PAGES;
  /** @type {ReturnType<typeof normalizePullRequest>[]} */
  const pulls = [];
  let url = `https://api.github.com/repos/${input.repository}/pulls?state=open&per_page=100&page=1`;
  for (let page = 0; page < maxPages; page += 1) {
    const response = await input.fetchImpl(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${input.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'jovie-linear-sync-on-merge',
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub HTTP ${response.status}`);
    }
    const batch = await response.json();
    if (!Array.isArray(batch)) {
      throw new Error('GitHub pulls response was not a list');
    }
    pulls.push(...batch.map(normalizePullRequest));
    const next = nextLink(response.headers?.get?.('link') ?? '');
    if (!next) return { pulls, complete: true };
    url = next;
  }
  return { pulls, complete: false };
}

const ISSUE_QUERY = `query IssueDoneState($issueId: String!) {
  issue(id: $issueId) {
    id
    identifier
    labels(first: 50) { nodes { name } }
    children(first: 50) { nodes { identifier } }
    team { states { nodes { id name type } } }
  }
}`;

/**
 * @param {{
 *   readonly fetchImpl?: typeof fetch,
 *   readonly env?: NodeJS.ProcessEnv,
 *   readonly log?: (message: string) => void,
 *   readonly allowlist?: ReadonlySet<string>,
 * }} [options]
 */
export async function syncLinearIssueOnMerge(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const env = options.env ?? process.env;
  const log = options.log ?? (message => console.log(message));
  const ref = extractMergeIssueRef({
    body: env.PR_BODY,
    headRef: env.HEAD_REF,
  });
  if (!ref.identifier && !ref.issueId) {
    log('No linear issue marker or branch identifier found; skipping');
    return { action: 'skip', comment: '', identifier: '' };
  }
  const apiKey = env.LINEAR_API_KEY ?? '';
  if (!apiKey) {
    log('LINEAR_API_KEY not set; skipping');
    return { action: 'skip', comment: '', identifier: ref.identifier };
  }
  const lookupId = ref.issueId || ref.identifier;
  const data = await linearGraphql(fetchImpl, apiKey, ISSUE_QUERY, {
    issueId: lookupId,
  });
  const issue = readIssueSnapshot(data.issue);
  if (!issue.id || !issue.identifier) {
    log(`Could not resolve Linear issue for lookup '${lookupId}'; skipping`);
    return { action: 'skip', comment: '', identifier: ref.identifier };
  }
  const repository = env.GITHUB_REPOSITORY ?? '';
  const token = env.GITHUB_TOKEN ?? '';
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !token) {
    throw new Error(
      'GITHUB_REPOSITORY and GITHUB_TOKEN are required before closing a Linear issue'
    );
  }
  let scanFailed = false;
  let openPulls = { pulls: [], complete: true };
  try {
    openPulls = await listOpenPullRequests({
      fetchImpl,
      token,
      repository,
    });
  } catch (error) {
    scanFailed = true;
    openPulls = { pulls: [], complete: false };
    const message = error instanceof Error ? error.message : String(error);
    log(`Open pull request scan failed: ${message}`);
  }
  const mergingPull = {
    number: Number(env.PR_NUMBER),
    url: String(env.PR_URL ?? ''),
    sha: String(env.MERGE_SHA ?? ''),
  };
  const decision = decideLinearCloseOnMerge({
    issue,
    pullRequests: openPulls.pulls,
    mergingPull,
    allowlist: options.allowlist,
    scanComplete: openPulls.complete,
  });
  if (decision.action === 'close') {
    const stateId = selectDoneStateId(issue.states);
    if (!stateId) {
      throw new Error(
        `No completed Linear state for ${issue.identifier}; left the issue open`
      );
    }
    const updated = await linearGraphql(
      fetchImpl,
      apiKey,
      `mutation SetIssueDone($issueId: String!, $stateId: String!) {
        issueUpdate(id: $issueId, input: { stateId: $stateId }) { success }
      }`,
      { issueId: issue.id, stateId }
    );
    if (updated.issueUpdate?.success !== true) {
      throw new Error(`Linear refused to mark ${issue.identifier} Done`);
    }
  }
  const commented = await linearGraphql(
    fetchImpl,
    apiKey,
    `mutation AddDoneComment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) { success }
    }`,
    { issueId: issue.id, body: decision.comment }
  );
  if (commented.commentCreate?.success !== true) {
    throw new Error(`Linear refused the merge comment on ${issue.identifier}`);
  }
  if (scanFailed) {
    throw new Error(
      `Left ${issue.identifier} open because the open pull request scan failed`
    );
  }
  log(
    decision.action === 'close'
      ? `Marked ${issue.identifier} Done`
      : `Left ${issue.identifier} open`
  );
  return {
    action: decision.action,
    comment: decision.comment,
    identifier: issue.identifier,
  };
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  syncLinearIssueOnMerge().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
