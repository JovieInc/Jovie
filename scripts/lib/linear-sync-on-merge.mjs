#!/usr/bin/env node
/**
 * Project merged pull requests onto the Linear validation lifecycle
 * (JOV-7694): Merging until a verified production generation contains the
 * merge, Validating while required receipts are missing, Rework on a required
 * failure, and Done only when every required receipt passes. Merge alone
 * never marks an issue Done.
 *
 * Linked means a linear-issue-id / linear-issue-identifier marker in the PR
 * body, a jov-NNNN branch reference, the identifier in the title, or a native
 * Linear attachment. Commissioning and parent issues enter the lifecycle but
 * need an outcome receipt (JOV-7300). Invariant consumer: JOV-INV-041.
 */

import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GREEN_MARKER } from './remediation-signal.mjs';
import { LIFECYCLE_STATES } from './validation-lifecycle.mjs';
import {
  createProductionFacts,
  fetchWithRetry,
  githubClient,
  reconcileValidation,
} from './validation-sync.mjs';

export const LINEAR_API = 'https://api.linear.app/graphql';
export const COMMISSIONING_PARENT_ALLOWLIST = new Set([
  'JOV-5853',
  // Liveness owner: merge is explicitly not exact-runtime or recurrence proof.
  'JOV-6004',
]);

const IDENTIFIER_RE = /^JOV-(\d+)$/i;
const COMMISSIONING_LABEL_RE = /commission/i;
const PARENT_LABEL_RE = /^(parent|epic|type:epic)$/i;
const MAX_OPEN_PR_PAGES = 20;

/**
 * Subset of fetch that production `globalThis.fetch` and the regression
 * doubles both satisfy. checkJs rejects a test double typed as `typeof fetch`
 * when it returns a plain envelope instead of `Response`.
 *
 * @typedef {{
 *   ok: boolean,
 *   status?: number,
 *   json: () => Promise<unknown>,
 *   headers?: { get?: (name: string) => string | null | undefined },
 * }} HttpResponse
 * @typedef {(
 *   input: string | URL | Request,
 *   init?: RequestInit,
 * ) => Promise<HttpResponse>} HttpFetch
 */

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
 *   title: string,
 *   description: string,
 *   labels: string[],
 *   description: string,
 *   comments: string[],
 *   children: string[],
 *   hasChildren: boolean,
 *   acceptanceMetadataVerified: boolean,
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
  const commentNodes = Array.isArray(record.comments)
    ? record.comments
    : record.comments &&
        typeof record.comments === 'object' &&
        Array.isArray(
          /** @type {{ nodes?: unknown }} */ (record.comments).nodes
        )
      ? /** @type {{ nodes: unknown[] }} */ (record.comments).nodes
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
    title: typeof record.title === 'string' ? record.title : '',
    description:
      typeof record.description === 'string' ? record.description : '',
    labels: labelNodes.map(labelName).filter(Boolean),
    comments: commentNodes
      .map(comment => {
        if (typeof comment === 'string') return comment;
        if (!comment || typeof comment !== 'object') return '';
        const body = Reflect.get(comment, 'body');
        return typeof body === 'string' ? body : '';
      })
      .filter(Boolean),
    children,
    hasChildren: childNodes.length > 0,
    acceptanceMetadataVerified:
      typeof record.title === 'string' &&
      (record.description === null || typeof record.description === 'string') &&
      Array.isArray(Reflect.get(Object(record.children), 'nodes')) &&
      Array.isArray(Reflect.get(Object(record.labels), 'nodes')) &&
      labelNodes.every(
        label =>
          label &&
          typeof label === 'object' &&
          typeof Reflect.get(label, 'name') === 'string'
      ),
    states: states.filter(state => state && typeof state === 'object'),
  };
}

/**
 * @param {{
 *   readonly identifier?: string,
 *   readonly title?: string,
 *   readonly description?: string,
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
  if (
    /^(?:codex\s+)?(?:goal|epic|commission(?:ing)?)(?:\s|:)/i.test(
      issue.title ?? ''
    ) ||
    /^\s*\/goal(?:\s|$)/im.test(issue.description ?? '')
  )
    signals.push('goal or commissioning acceptance');
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
 * Reasons the lifecycle must not move the issue at all. Commissioning and
 * parent acceptance no longer hold here: they enter the lifecycle and stay
 * out of Done until an outcome receipt passes.
 *
 * @param {{
 *   readonly issue: {
 *     readonly id?: string,
 *     readonly identifier?: string,
 *     readonly labels?: readonly string[],
 *     readonly openChildren?: readonly string[],
 *     readonly acceptanceMetadataVerified?: boolean,
 *   },
 *   readonly pullRequests: readonly object[],
 *   readonly mergingNumber?: number,
 *   readonly scanComplete?: boolean,
 *   readonly checkGreen?: boolean,
 * }} input
 * @returns {{ holds: string[], blockingNumbers: number[] }}
 */
export function lifecycleHolds(input) {
  const identifier = String(input.issue.identifier ?? '').toUpperCase();
  const mergingNumber = Number(input.mergingNumber ?? 0);
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
  const holds = [];
  if (input.issue.acceptanceMetadataVerified === false) {
    holds.push('Canonical acceptance metadata is unverified.');
  }
  if (blocking.length > 0) holds.push(formatBlockingPulls(blocking));
  if (input.scanComplete === false) {
    holds.push(
      'The open pull request scan stopped before the last page, so the issue was left in place.'
    );
  }
  const openChildren = input.issue.openChildren ?? [];
  if (openChildren.length > 0) {
    holds.push(
      `Sub-issues are still open: ${openChildren.slice(0, 10).join(', ')}.`
    );
  }
  const remediationLabeled = (input.issue.labels ?? []).some(label =>
    String(label).startsWith('remediation:')
  );
  if (remediationLabeled && input.checkGreen !== true) {
    holds.push(
      'Fingerprinted remediation issues stay open while the check is red.'
    );
  }
  return { holds, blockingNumbers: blocking.map(pull => pull.number) };
}

/**
 * @param {HttpFetch} fetchImpl
 * @param {string} apiKey
 * @param {string} query
 * @param {Record<string, unknown>} variables
 * @returns {Promise<Record<string, any>>}
 */
async function linearGraphql(fetchImpl, apiKey, query, variables) {
  const response = await fetchWithRetry(fetchImpl, LINEAR_API, {
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

/**
 * @param {{
 *   readonly fetchImpl: HttpFetch,
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

const ISSUE_FIELDS = `
    id
    identifier
    title
    description
    state { id name type }
    labels(first: 50) { nodes { name } }
    comments(first: 100) {
      nodes { body createdAt }
      pageInfo { hasNextPage endCursor }
    }
    children(first: 50) { nodes { identifier state { type } } }
    attachments(first: 50) { nodes { url } }
    history(first: 100) { nodes { fromState { type } toState { type } } }
    team { states { nodes { id name type } } }`;

const ISSUE_QUERY = `query IssueLifecycle($issueId: String!) {
  issue(id: $issueId) {${ISSUE_FIELDS}
  }
}`;

const COMMENTS_PAGE_QUERY = `query IssueLifecycleComments($issueId: String!, $after: String!) {
  issue(id: $issueId) {
    comments(first: 100, after: $after) {
      nodes { body createdAt }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const ISSUE_STATE_QUERY = `query IssueLifecycleState($issueId: String!) {
  issue(id: $issueId) { id state { id name } }
}`;

const SWEEP_QUERY = `query LifecycleSweep($states: [String!]!, $after: String) {
  issues(
    first: 50
    after: $after
    filter: { team: { key: { eq: "JOV" } }, state: { name: { in: $states } } }
  ) {
    nodes { identifier }
    pageInfo { hasNextPage endCursor }
  }
}`;

const MAX_COMMENT_PAGES = 10;
const MAX_SWEEP_PAGES = 10;
const CI_HARNESS_MANIFEST = '.github/ci-harness/manifest.json';

/**
 * Read the issue with every comment in server order. The escaped-defect
 * parser and receipt reader take the latest marker, so order matters.
 *
 * @param {HttpFetch} fetchImpl
 * @param {string} apiKey
 * @param {string} lookupId
 */
async function readLifecycleIssue(fetchImpl, apiKey, lookupId) {
  const data = await linearGraphql(fetchImpl, apiKey, ISSUE_QUERY, {
    issueId: lookupId,
  });
  const raw = data.issue;
  if (!raw || typeof raw !== 'object') return null;
  const comments = [...(raw.comments?.nodes ?? [])];
  let pageInfo = raw.comments?.pageInfo;
  for (
    let page = 0;
    pageInfo?.hasNextPage === true && page < MAX_COMMENT_PAGES;
    page += 1
  ) {
    const more = await linearGraphql(fetchImpl, apiKey, COMMENTS_PAGE_QUERY, {
      issueId: raw.id,
      after: pageInfo.endCursor,
    });
    comments.push(...(more.issue?.comments?.nodes ?? []));
    pageInfo = more.issue?.comments?.pageInfo;
  }
  if (pageInfo?.hasNextPage === true) {
    throw new Error(
      `Comment history for ${raw.identifier} exceeds the read bound`
    );
  }
  comments.sort(
    (left, right) =>
      Date.parse(String(left?.createdAt ?? '')) -
      Date.parse(String(right?.createdAt ?? ''))
  );
  const snapshot = readIssueSnapshot({
    ...raw,
    comments: { nodes: comments },
  });
  const childNodes = Array.isArray(raw.children?.nodes)
    ? raw.children.nodes
    : [];
  return {
    ...snapshot,
    state: {
      id: String(raw.state?.id ?? ''),
      name: String(raw.state?.name ?? ''),
      type: String(raw.state?.type ?? ''),
    },
    commentRecords: comments.map(comment => ({
      body: String(comment?.body ?? ''),
      createdAt: String(comment?.createdAt ?? ''),
    })),
    openChildren: childNodes
      .filter(
        child =>
          !['completed', 'canceled'].includes(String(child?.state?.type ?? ''))
      )
      .map(child => String(child?.identifier ?? '').toUpperCase())
      .filter(Boolean),
    reopenedAfterDone: (raw.history?.nodes ?? []).some(
      /** @param {any} entry */
      entry =>
        entry?.fromState?.type === 'completed' &&
        typeof entry?.toState?.type === 'string' &&
        entry.toState.type !== 'completed'
    ),
    attachmentUrls: (raw.attachments?.nodes ?? [])
      .map(node => String(node?.url ?? ''))
      .filter(Boolean),
  };
}

/**
 * The Linear side of one lifecycle evaluation: read the issue, compute the
 * merge-sync holds, and hand the writes to a port that re-reads state first.
 *
 * @param {{
 *   readonly lookupId: string,
 *   readonly fetchImpl: HttpFetch,
 *   readonly apiKey: string,
 *   readonly github: import('./validation-sync.mjs').GithubGet,
 *   readonly repository: string,
 *   readonly facts: ReturnType<typeof createProductionFacts>,
 *   readonly openPulls: { pulls: readonly object[], complete: boolean },
 *   readonly harnessManifest: unknown,
 *   readonly allowlist?: ReadonlySet<string>,
 *   readonly eventPull?: { number: number },
 *   readonly dryRun?: boolean,
 *   readonly log: (message: string) => void,
 * }} ctx
 */
export async function reconcileIssueLifecycle(ctx) {
  const issue = await readLifecycleIssue(
    ctx.fetchImpl,
    ctx.apiKey,
    ctx.lookupId
  );
  if (!issue?.id || !issue.identifier) {
    ctx.log(
      `Could not resolve Linear issue for lookup '${ctx.lookupId}'; skipping`
    );
    return { action: 'skip', identifier: '', target: null, comment: '' };
  }
  const checkGreen = (issue.commentRecords ?? []).some(comment =>
    String(comment?.body ?? '').includes(GREEN_MARKER)
  );
  const { holds } = lifecycleHolds({
    issue,
    pullRequests: ctx.openPulls.pulls,
    mergingNumber: ctx.eventPull?.number,
    scanComplete: ctx.openPulls.complete,
    checkGreen,
  });
  /** @param {string} query @param {Record<string, unknown>} variables */
  const linear = (query, variables) =>
    linearGraphql(ctx.fetchImpl, ctx.apiKey, query, variables);
  return reconcileValidation({
    issue,
    holds,
    parentReason: parentHoldReason(issue, ctx.allowlist),
    github: ctx.github,
    repository: ctx.repository,
    facts: ctx.facts,
    harnessManifest: ctx.harnessManifest,
    eventPull: ctx.eventPull,
    dryRun: ctx.dryRun,
    log: ctx.log,
    linear: {
      readStateId: async issueId =>
        String(
          (await linear(ISSUE_STATE_QUERY, { issueId })).issue?.state?.id ?? ''
        ),
      setState: async (issueId, stateId) =>
        String(
          (
            await linear(
              `mutation SetLifecycleState($issueId: String!, $stateId: String!) {
        issueUpdate(id: $issueId, input: { stateId: $stateId }) { success issue { state { name } } }
      }`,
              { issueId, stateId }
            )
          ).issueUpdate?.issue?.state?.name ?? ''
        ),
      addComment: async (issueId, body) =>
        (
          await linear(
            `mutation AddLifecycleComment($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) { success }
      }`,
            { issueId, body }
          )
        ).commentCreate?.success === true,
    },
  });
}

/**
 * @param {string} root
 * @returns {unknown}
 */
function loadHarnessManifest(root) {
  try {
    return JSON.parse(
      readFileSync(resolvePath(root, CI_HARNESS_MANIFEST), 'utf8')
    );
  } catch {
    return null;
  }
}

/**
 * Merge event: evaluate the linked issue. Sweep (production generation
 * completed, schedule, manual replay): evaluate every issue in the lifecycle
 * states. Both run the same evaluation, so order and replay do not matter.
 *
 * @param {{
 *   readonly fetchImpl?: HttpFetch,
 *   readonly env?: NodeJS.ProcessEnv,
 *   readonly log?: (message: string) => void,
 *   readonly allowlist?: ReadonlySet<string>,
 *   readonly harnessManifest?: unknown,
 * }} [options]
 */
export async function syncLinearIssueOnMerge(options = {}) {
  /** @type {HttpFetch} */
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const env = options.env ?? process.env;
  const log = options.log ?? (message => console.log(message));
  const sweep = env.LIFECYCLE_MODE === 'sweep';
  const ref = extractMergeIssueRef({
    body: env.PR_BODY,
    headRef: env.HEAD_REF,
  });
  if (!sweep && !ref.identifier && !ref.issueId) {
    log('No linear issue marker or branch identifier found; skipping');
    return { action: 'skip', comment: '', identifier: '', results: [] };
  }
  const apiKey = env.LINEAR_API_KEY ?? '';
  if (!apiKey) {
    log('LINEAR_API_KEY not set; skipping');
    return {
      action: 'skip',
      comment: '',
      identifier: ref.identifier,
      results: [],
    };
  }
  const repository = env.GITHUB_REPOSITORY ?? '';
  const token = env.GITHUB_TOKEN ?? '';
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !token) {
    throw new Error(
      'GITHUB_REPOSITORY and GITHUB_TOKEN are required before moving a Linear issue'
    );
  }
  const github = githubClient(fetchImpl, token);
  const facts = createProductionFacts({
    fetchImpl,
    github,
    repository,
    versionUrl: env.PRODUCTION_VERSION_URL,
  });
  const harnessManifest =
    options.harnessManifest ??
    loadHarnessManifest(env.GITHUB_WORKSPACE ?? process.cwd());
  let openPulls = { pulls: /** @type {object[]} */ ([]), complete: true };
  try {
    openPulls = await listOpenPullRequests({ fetchImpl, token, repository });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Open pull request scan failed: ${message}`);
    openPulls = { pulls: [], complete: false };
  }

  const lookups = [];
  if (sweep) {
    let after = null;
    for (let page = 0; page < MAX_SWEEP_PAGES; page += 1) {
      const data = await linearGraphql(fetchImpl, apiKey, SWEEP_QUERY, {
        states: [
          LIFECYCLE_STATES.merging,
          LIFECYCLE_STATES.validating,
          LIFECYCLE_STATES.rework,
        ],
        after,
      });
      for (const node of data.issues?.nodes ?? []) {
        if (typeof node?.identifier === 'string') lookups.push(node.identifier);
      }
      if (data.issues?.pageInfo?.hasNextPage !== true) break;
      after = data.issues.pageInfo.endCursor;
    }
  } else {
    lookups.push(ref.issueId || ref.identifier);
  }

  const eventPull = sweep ? undefined : { number: Number(env.PR_NUMBER) };
  const results = [];
  const failures = [];
  for (const lookupId of lookups) {
    try {
      results.push(
        await reconcileIssueLifecycle({
          lookupId,
          fetchImpl,
          apiKey,
          github,
          repository,
          facts,
          openPulls,
          harnessManifest,
          allowlist: options.allowlist,
          eventPull,
          dryRun: env.LIFECYCLE_DRY_RUN === '1',
          log,
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${lookupId}: ${message}`);
      log(`Lifecycle evaluation failed for ${lookupId}: ${message}`);
    }
  }
  const reasons = [...failures];
  if (!openPulls.complete) {
    reasons.unshift(
      'the open pull request scan failed, so issues were left in place'
    );
  }
  if (reasons.length > 0) {
    throw new Error(`Lifecycle evaluation failed: ${reasons.join('; ')}`);
  }
  const first = results[0];
  return {
    action: first?.action ?? 'skip',
    comment: first?.comment ?? '',
    identifier: first?.identifier ?? ref.identifier,
    results,
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
