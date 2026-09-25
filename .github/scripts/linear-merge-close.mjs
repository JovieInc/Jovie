#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const COMMISSIONING_PARENT_IDS = new Set(['JOV-5853']);
const ISSUE_IDENTIFIER = /^JOV-\d+$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE = /\b(?:commission(?:ing)?|parent)\b/i;
const DECLARES_DEPENDENT_STACK = /dependent\s+stack/i;
const DECLARES_REMAINING_WORK =
  /remain(?:s|ing)?\s+required\s+work|required\s+work\s+remains|still\s+to\s+do/i;
const CLOSED_STATE_TYPES = new Set(['completed', 'canceled', 'cancelled']);

export function extractLinearRefs(body, headRef) {
  const text = String(body ?? '');
  const issueId = markerValue(text, 'linear-issue-id');
  const marked = markerValue(text, 'linear-issue-identifier').toUpperCase();
  const branch = (
    String(headRef ?? '').match(/jov-\d+/i)?.[0] ?? ''
  ).toUpperCase();
  return {
    issueId,
    issueIdentifier: ISSUE_IDENTIFIER.test(marked) ? marked : branch,
  };
}

export function pullRequestLinksIssue(pullRequest, issue) {
  const identifier = String(issue?.identifier ?? '').toUpperCase();
  const issueId = String(issue?.id ?? '');
  if (!ISSUE_IDENTIFIER.test(identifier)) return false;
  const body = String(pullRequest?.body ?? '');
  const title = String(pullRequest?.title ?? '');
  const head = String(pullRequest?.headRefName ?? '');
  for (const marker of markerValues(body, 'linear-issue-id')) {
    if (marker === issueId || marker.toUpperCase() === identifier) return true;
  }
  for (const marker of markerValues(body, 'linear-issue-identifier')) {
    if (marker.toUpperCase() === identifier) return true;
  }
  const branch = (head.match(/jov-\d+/i)?.[0] ?? '').toUpperCase();
  if (branch === identifier) return true;
  const word = new RegExp(`\\b${identifier}\\b`, 'i');
  return word.test(title) || word.test(body);
}

export function isOpenOrDraftPullRequest(pullRequest) {
  if (pullRequest?.isDraft || pullRequest?.draft) return true;
  return String(pullRequest?.state ?? '').toLowerCase() === 'open';
}

export function selectDoneStateId(states) {
  const match = (states ?? []).find(state => {
    const type = String(state?.type ?? '').toLowerCase();
    const name = String(state?.name ?? '').toLowerCase();
    return type === 'completed' || /done|completed/.test(name);
  });
  return match?.id ?? '';
}

export function decideLinearMergeClose({
  currentPrNumber,
  prBody = '',
  issue,
  linkedPullRequests,
  siblingLookupComplete = false,
}) {
  const identifier = String(issue?.identifier ?? '').toUpperCase();
  if (!ISSUE_IDENTIFIER.test(identifier)) {
    return hold(
      'unresolved-issue',
      'Linear issue did not resolve to a JOV identifier.'
    );
  }
  if (COMMISSIONING_PARENT_IDS.has(identifier)) {
    return hold(
      'commissioning-or-parent-issue',
      `${identifier} is a commissioning or parent issue.`
    );
  }
  if (typeof issue?.title !== 'string' || !Array.isArray(issue?.labels)) {
    return hold(
      'issue-shape-incomplete',
      'Linear issue title or labels were missing.'
    );
  }
  if (
    ROLE.test(issue.title) ||
    issue.labels.some(label => ROLE.test(String(label)))
  ) {
    return hold(
      'commissioning-or-parent-issue',
      `${identifier} is a commissioning or parent issue.`
    );
  }
  const subIssues = classifySubIssues(issue);
  if (subIssues.reason) return hold(subIssues.reason, subIssues.detail);
  if (!siblingLookupComplete || !Array.isArray(linkedPullRequests)) {
    return hold(
      'sibling-lookup-incomplete',
      'Linked pull request lookup did not complete.'
    );
  }
  const blockers = linkedPullRequests.filter(
    pullRequest =>
      pullRequest?.number !== currentPrNumber &&
      isOpenOrDraftPullRequest(pullRequest) &&
      pullRequestLinksIssue(pullRequest, issue)
  );
  if (blockers.length > 0) {
    const numbers = blockers.map(pullRequest => `#${pullRequest.number}`);
    const noun = blockers.length === 1 ? 'PR' : 'PRs';
    const verb = blockers.length === 1 ? 'is' : 'are';
    return hold(
      'open-or-draft-linked-pull-request',
      `Linked ${noun} ${numbers.join(', ')} ${verb} still open or draft.`
    );
  }
  if (DECLARES_DEPENDENT_STACK.test(String(prBody))) {
    return hold('dependent-stack', 'PR body declares a dependent stack.');
  }
  if (DECLARES_REMAINING_WORK.test(String(prBody))) {
    return hold(
      'remaining-required-work',
      'PR body declares remaining required work.'
    );
  }
  return { transition: true, reason: 'clear', detail: '' };
}

export function mergeComment({ identifier, prUrl, mergeSha, decision }) {
  const line = `PR merged for ${identifier}: ${prUrl} (merge SHA: ${mergeSha})`;
  if (decision?.transition) return line;
  const detail = decision?.detail ? ` ${decision.detail}` : '';
  return `${line}\n\nDid not move to Done (${decision?.reason ?? 'held'}).${detail}`;
}

export async function syncLinearOnMerge(env, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const log = deps.log ?? (message => console.log(message));
  const refs = extractLinearRefs(env.PR_BODY ?? '', env.HEAD_REF ?? '');
  if (!refs.issueId && !refs.issueIdentifier) {
    log('No linear issue marker or branch identifier found; skipping');
    return { transitioned: false, commented: false, reason: 'no-marker' };
  }
  if (!env.LINEAR_API_KEY) {
    log('LINEAR_API_KEY not set; skipping');
    return { transitioned: false, commented: false, reason: 'no-api-key' };
  }

  let loaded;
  try {
    loaded = await loadLinearIssue({
      fetchImpl,
      apiKey: env.LINEAR_API_KEY,
      refs,
    });
  } catch (error) {
    log(
      `Linear lookup failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
    return {
      transitioned: false,
      commented: false,
      reason: 'linear-lookup-failed',
      failed: true,
    };
  }
  if (!loaded.issue) {
    log(
      `Could not resolve Linear issue for lookup '${loaded.lookupId}'; skipping`
    );
    return {
      transitioned: false,
      commented: false,
      reason: 'unresolved-issue',
    };
  }

  const siblings = await loadOpenPullRequests({
    fetchImpl,
    token: env.GITHUB_TOKEN ?? '',
    repository: env.GITHUB_REPOSITORY ?? '',
  });
  let decision = decideLinearMergeClose({
    currentPrNumber: Number(env.PR_NUMBER),
    prBody: env.PR_BODY ?? '',
    issue: loaded.issue,
    linkedPullRequests: siblings.pulls,
    siblingLookupComplete: siblings.complete,
  });
  let transitioned = false;
  if (decision.transition && !loaded.doneStateId) {
    decision = hold(
      'done-state-unresolved',
      'No completed Linear state was found.'
    );
  } else if (decision.transition) {
    try {
      const updated = await linearGraphql(
        fetchImpl,
        env.LINEAR_API_KEY,
        `mutation SetIssueDone($issueId: String!, $stateId: String!) {
          issueUpdate(id: $issueId, input: { stateId: $stateId }) { success }
        }`,
        { issueId: loaded.issue.id, stateId: loaded.doneStateId }
      );
      transitioned = updated?.issueUpdate?.success === true;
    } catch {
      transitioned = false;
    }
    if (!transitioned) {
      decision = hold(
        'linear-update-failed',
        'Linear did not confirm the Done transition.'
      );
    }
  }

  const body = mergeComment({
    identifier: loaded.issue.identifier,
    prUrl: env.PR_URL ?? '',
    mergeSha: env.MERGE_SHA ?? '',
    decision,
  });
  let commented = false;
  try {
    const created = await linearGraphql(
      fetchImpl,
      env.LINEAR_API_KEY,
      `mutation AddDoneComment($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) { success }
      }`,
      { issueId: loaded.issue.id, body }
    );
    commented = created?.commentCreate?.success === true;
  } catch (error) {
    log(
      `Linear comment failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
  if (!commented) {
    return {
      transitioned,
      commented: false,
      reason: decision.reason,
      failed: true,
    };
  }
  log(
    transitioned
      ? `Moved ${loaded.issue.identifier} to Done`
      : `Left ${loaded.issue.identifier} unchanged (${decision.reason})`
  );
  return { transitioned, commented: true, reason: decision.reason };
}

export async function loadOpenPullRequests({ fetchImpl, token, repository }) {
  if (!token || !/^[^/\s]+\/[^/\s]+$/.test(String(repository ?? ''))) {
    return { pulls: [], complete: false };
  }
  const pulls = [];
  try {
    for (let page = 1; page <= 10; page += 1) {
      const url =
        `https://api.github.com/repos/${repository}/pulls` +
        `?state=open&per_page=100&page=${page}`;
      const response = await fetchImpl(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'jovie-linear-merge-close',
        },
      });
      if (!response.ok) return { pulls: [], complete: false };
      const batch = await response.json();
      if (!Array.isArray(batch)) return { pulls: [], complete: false };
      pulls.push(...batch.map(normalizePull));
      if (batch.length < 100) return { pulls, complete: true };
    }
    return { pulls, complete: false };
  } catch {
    return { pulls: [], complete: false };
  }
}

function hold(reason, detail) {
  return { transition: false, reason, detail };
}

function normalizeLabels(labels) {
  const nodes = labels?.nodes;
  if (labels?.pageInfo?.hasNextPage !== false || !Array.isArray(nodes)) {
    return null;
  }
  return nodes.map(label => label?.name).filter(Boolean);
}

function normalizeChildren(children) {
  const nodes = children?.nodes;
  const hasNextPage = children?.pageInfo?.hasNextPage;
  return {
    complete: hasNextPage === false && Array.isArray(nodes),
    nodes: Array.isArray(nodes) ? nodes : [],
  };
}

function classifySubIssues(issue) {
  const children = issue?.children;
  if (
    !children ||
    children.complete !== true ||
    !Array.isArray(children.nodes)
  ) {
    return {
      reason: 'sub-issue-lookup-incomplete',
      detail: 'Sub-issue lookup did not complete.',
    };
  }
  const open = children.nodes.filter(
    child =>
      !CLOSED_STATE_TYPES.has(String(child?.state?.type ?? '').toLowerCase())
  );
  if (open.length === 0) return {};
  const ids = open.map(child => child?.identifier).filter(Boolean);
  return {
    reason: 'open-sub-issues',
    detail: ids.length
      ? `Open sub-issues: ${ids.join(', ')}.`
      : 'Open sub-issues remain.',
  };
}

function markerValue(body, name) {
  return markerValues(body, name)[0] ?? '';
}

function markerValues(body, name) {
  return [...String(body).matchAll(new RegExp(`${name}:([^\\s>]+)`, 'gi'))].map(
    match => match[1]
  );
}

function normalizePull(pullRequest) {
  return {
    number: pullRequest?.number,
    state: 'open',
    isDraft: Boolean(pullRequest?.draft),
    title: pullRequest?.title ?? '',
    body: pullRequest?.body ?? '',
    headRefName: pullRequest?.head?.ref ?? '',
  };
}

async function loadLinearIssue({ fetchImpl, apiKey, refs }) {
  const candidates = [];
  if (UUID.test(refs.issueId)) candidates.push(refs.issueId);
  if (refs.issueIdentifier) candidates.push(refs.issueIdentifier);
  if (refs.issueId && !UUID.test(refs.issueId)) candidates.push(refs.issueId);
  let lookupId = candidates[0] ?? '';
  for (const candidate of candidates) {
    lookupId = candidate;
    const data = await linearGraphql(
      fetchImpl,
      apiKey,
      `query IssueDoneState($issueId: String!) {
        issue(id: $issueId) {
          id
          identifier
          title
          labels(first: 50) {
            pageInfo { hasNextPage }
            nodes { name }
          }
          children(first: 50) {
            pageInfo { hasNextPage }
            nodes { identifier state { name type } }
          }
          team { states { nodes { id name type } } }
        }
      }`,
      { issueId: candidate }
    );
    const issue = data?.issue;
    if (!issue?.id || !issue?.identifier) continue;
    return {
      lookupId: candidate,
      doneStateId: selectDoneStateId(issue.team?.states?.nodes),
      issue: {
        id: issue.id,
        identifier: String(issue.identifier).toUpperCase(),
        title: typeof issue.title === 'string' ? issue.title : null,
        labels: normalizeLabels(issue.labels),
        children: normalizeChildren(issue.children),
      },
    };
  }
  return { lookupId, issue: null, doneStateId: '' };
}

async function linearGraphql(fetchImpl, apiKey, query, variables) {
  const response = await fetchImpl('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`Linear API request failed (${response.status})`);
  }
  const payload = await response.json();
  if (!payload || payload.errors) {
    throw new Error('Linear API returned errors');
  }
  return payload.data ?? {};
}

function isDirectRun() {
  const invokedPath = process.argv[1];
  return Boolean(
    invokedPath && import.meta.url === pathToFileURL(invokedPath).href
  );
}

if (isDirectRun()) {
  syncLinearOnMerge(process.env)
    .then(result => {
      if (result.failed) process.exitCode = 1;
    })
    .catch(error => {
      console.error(
        error instanceof Error ? error.message : 'linear merge close failed'
      );
      process.exitCode = 1;
    });
}
