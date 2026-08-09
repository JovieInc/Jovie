/**
 * Minimal Linear GraphQL client for backlog orchestrator.
 *
 * Deterministic wrapper around Linear's public API.
 * No SDK — bare fetch with the team's API key env var.
 */

import { setDefaultResultOrder } from 'node:dns';

// Gem hosts may have an unreachable IPv6 route while IPv4 reaches Linear.
// Prefer IPv4 so the bounded fetch/retry policy handles application failures,
// not avoidable dual-stack connection stalls.
setDefaultResultOrder('ipv4first');

export const LINEAR_API_KEY_ENV = 'LINEAR_API_KEY';

const API_URL = 'https://api.linear.app/graphql';
export const LINEAR_REQUEST_TIMEOUT_MS = 10_000;
export const LINEAR_MAX_ATTEMPTS = 3;
export const LINEAR_RETRY_BASE_MS = 100;
export const LINEAR_MAX_ERROR_BODY_LENGTH = 256;
export const LINEAR_PAGE_SIZE = 50;
export const LINEAR_MAX_PAGES = 1000;

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const JSON_CONTENT_TYPE = /(^|;)\s*application\/json\s*(;|$)/i;

function redactBody(value) {
  const text = String(value ?? '')
    .replace(/bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(
      /(authorization|token|api[-_ ]?key|secret|password)\s*[:=]\s*[^,;\s]+/gi,
      '$1=[REDACTED]'
    );
  return text.length > LINEAR_MAX_ERROR_BODY_LENGTH
    ? `${text.slice(0, LINEAR_MAX_ERROR_BODY_LENGTH)}…`
    : text;
}

function responseMetadata(response, attempt, extra = {}) {
  return {
    status: Number.isFinite(response?.status) ? response.status : undefined,
    contentType: response?.headers?.get?.('content-type') || undefined,
    attempt,
    ...extra,
  };
}

export class LinearTransportError extends Error {
  /** @param {string} message @param {any} [options] */
  constructor(message, { code, cause, attempts, metadata, body } = {}) {
    super(message, { cause });
    this.name = 'LinearTransportError';
    this.code = code;
    this.attempts = attempts;
    this.metadata = metadata;
    if (body !== undefined) this.body = redactBody(body);
  }
}

export class LinearPaginationError extends Error {
  /** @param {string} message @param {any} [options] */
  constructor(message, { code, coverage, cause } = {}) {
    super(message, { cause });
    this.name = 'LinearPaginationError';
    this.code = code;
    this.coverage = coverage;
  }
}

function paginationCoverage({
  complete,
  pages,
  scanned,
  hasNextPage,
  endCursor,
  reason = null,
}) {
  return {
    complete,
    pages,
    scanned,
    hasNextPage,
    endCursor,
    reason,
  };
}

/**
 * Collect one complete Linear connection without silently truncating it.
 * The caller supplies the page query so this invariant remains source-blind
 * and unit-testable. A partial connection is an error, never an empty result.
 */
export async function collectLinearConnectionPages(
  fetchPage,
  { maxPages = LINEAR_MAX_PAGES } = {}
) {
  if (!Number.isInteger(maxPages) || maxPages < 1)
    throw new TypeError('maxPages must be a positive integer');

  const issues = [];
  const seenIds = new Set();
  const seenCursors = new Set();
  let cursor = null;
  let pages = 0;

  while (true) {
    if (pages >= maxPages) {
      const coverage = paginationCoverage({
        complete: false,
        pages,
        scanned: issues.length,
        hasNextPage: true,
        endCursor: cursor,
        reason: 'page-limit-reached',
      });
      throw new LinearPaginationError(
        `Linear pagination remained open after ${pages} pages`,
        { code: 'PAGE_LIMIT', coverage }
      );
    }

    let edge;
    try {
      edge = await fetchPage(cursor);
    } catch (cause) {
      const coverage = paginationCoverage({
        complete: false,
        pages,
        scanned: issues.length,
        hasNextPage: true,
        endCursor: cursor,
        reason: 'page-fetch-failed',
      });
      throw new LinearPaginationError('Linear pagination page fetch failed', {
        code: 'PAGE_FETCH_FAILED',
        coverage,
        cause,
      });
    }

    const pageInfo = edge?.pageInfo;
    if (
      !Array.isArray(edge?.nodes) ||
      !pageInfo ||
      typeof pageInfo.hasNextPage !== 'boolean'
    ) {
      const coverage = paginationCoverage({
        complete: false,
        pages,
        scanned: issues.length,
        hasNextPage: true,
        endCursor: cursor,
        reason: 'malformed-page',
      });
      throw new LinearPaginationError('Linear pagination page was malformed', {
        code: 'MALFORMED_PAGE',
        coverage,
      });
    }

    pages += 1;
    for (const issue of edge.nodes) {
      const id = issue?.id;
      if (typeof id !== 'string' || id.length === 0 || seenIds.has(id)) {
        const coverage = paginationCoverage({
          complete: false,
          pages,
          scanned: issues.length,
          hasNextPage: pageInfo.hasNextPage,
          endCursor: pageInfo.endCursor ?? null,
          reason: id ? 'duplicate-issue' : 'issue-id-missing',
        });
        throw new LinearPaginationError(
          id
            ? `Linear pagination repeated issue ${id}`
            : 'Linear pagination issue was missing an id',
          {
            code: id ? 'DUPLICATE_ISSUE' : 'ISSUE_ID_MISSING',
            coverage,
          }
        );
      }
      seenIds.add(id);
      issues.push(issue);
    }

    if (!pageInfo.hasNextPage) {
      return {
        issues,
        coverage: paginationCoverage({
          complete: true,
          pages,
          scanned: issues.length,
          hasNextPage: false,
          endCursor: pageInfo.endCursor ?? cursor,
        }),
      };
    }

    const nextCursor = pageInfo.endCursor;
    if (
      typeof nextCursor !== 'string' ||
      nextCursor.length === 0 ||
      nextCursor === cursor ||
      seenCursors.has(nextCursor)
    ) {
      const coverage = paginationCoverage({
        complete: false,
        pages,
        scanned: issues.length,
        hasNextPage: true,
        endCursor: nextCursor ?? null,
        reason: 'cursor-did-not-advance',
      });
      throw new LinearPaginationError(
        'Linear pagination cursor did not advance',
        { code: 'CURSOR_STALLED', coverage }
      );
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
}

function requireKey() {
  const key = process.env[LINEAR_API_KEY_ENV];
  if (!key) throw new Error(`${LINEAR_API_KEY_ENV} not set`);
  return key;
}

/** @param {any} error */
function isTransientNetworkError(error) {
  return (
    error?.name === 'AbortError' ||
    error?.name === 'TimeoutError' ||
    error?.code === 'ETIMEDOUT' ||
    error?.code === 'ECONNRESET' ||
    error?.code === 'ECONNREFUSED' ||
    error?.code === 'ENETUNREACH' ||
    error?.code === 'EAI_AGAIN' ||
    error?.message === 'fetch failed'
  );
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** @param {any[]} errors */
export function classifyGraphQLErrors(errors) {
  const messages = errors.flatMap(error =>
    [error?.message, error?.extensions?.userPresentableMessage].filter(Boolean)
  );
  if (messages.some(message => /deprecated/i.test(message)))
    return 'DEPRECATED';
  if (
    messages.some(message =>
      /unauthori[sz]ed|invalid token|authentication/i.test(message)
    )
  )
    return 'AUTH';
  if (
    messages.some(message =>
      /cannot query field|unknown argument|validation|schema|syntax/i.test(
        message
      )
    )
  )
    return 'SCHEMA';
  return 'API';
}

/**
 * Bounded, retrying GraphQL transport. Only the API key is sent as the
 * normal Linear `Authorization` header; it is never logged or exposed in an
 * error. Retry is bounded to network, malformed responses, 429, and 5xx.
 */
export async function graphql(
  query,
  variables = {},
  {
    fetchImpl = /** @type {any} */ (globalThis.fetch),
    timeoutMs = LINEAR_REQUEST_TIMEOUT_MS,
    maxAttempts = LINEAR_MAX_ATTEMPTS,
    retryBaseMs = LINEAR_RETRY_BASE_MS,
    sleepImpl = sleep,
  } = {}
) {
  const key = requireKey();
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetchImpl(API_URL, {
        method: 'POST',
        headers: {
          Authorization: key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      const contentType = resp?.headers?.get?.('content-type') || '';
      const rawBody =
        typeof resp?.text === 'function'
          ? await resp.text()
          : JSON.stringify(await resp.json());
      const metadata = responseMetadata(resp, attempt);
      if (contentType && !JSON_CONTENT_TYPE.test(contentType)) {
        const error = /** @type {any} */ (
          new Error('Linear response was not JSON')
        );
        error.code = 'CONTENT_TYPE';
        error.retryable =
          RETRYABLE_STATUS.has(resp?.status) || resp?.status >= 500;
        throw Object.assign(error, { metadata, body: rawBody });
      }
      let data;
      try {
        data = JSON.parse(rawBody);
      } catch (parseError) {
        const error = /** @type {any} */ (
          new Error('Linear response contained malformed JSON', {
            cause: parseError,
          })
        );
        error.code = 'INVALID_JSON';
        error.retryable = true;
        throw Object.assign(error, { metadata, body: rawBody });
      }
      if (resp?.ok === false || resp?.status >= 400) {
        const error = /** @type {any} */ (
          new Error(`Linear HTTP error (${resp.status})`)
        );
        error.code =
          resp.status === 429
            ? 'RATE_LIMITED'
            : resp.status >= 500
              ? 'SERVER'
              : 'HTTP';
        error.retryable = RETRYABLE_STATUS.has(resp.status);
        throw Object.assign(error, { metadata, body: rawBody });
      }
      if (data.errors) {
        const error = /** @type {any} */ (
          new Error(
            `Linear API error: ${data.errors.map(e => e.message).join('; ')}`
          )
        );
        error.code = classifyGraphQLErrors(data.errors);
        error.metadata = metadata;
        throw error;
      }
      if (!data || typeof data !== 'object' || !Object.hasOwn(data, 'data')) {
        const error = /** @type {any} */ (
          new Error('Linear response had an invalid GraphQL shape')
        );
        error.code = 'SCHEMA';
        error.metadata = metadata;
        throw error;
      }
      return data.data;
    } catch (error) {
      const err = /** @type {any} */ (error);
      lastError = err;
      const retryable = Boolean(err?.retryable) || isTransientNetworkError(err);
      if (!retryable || attempt === maxAttempts) {
        const code =
          err?.name === 'AbortError' || err?.name === 'TimeoutError'
            ? 'TIMEOUT'
            : isTransientNetworkError(err)
              ? 'NETWORK'
              : err?.code || 'API';
        throw new LinearTransportError(
          `Linear GraphQL request failed (${code.toLowerCase()}, attempts=${attempt})`,
          {
            code,
            cause: isTransientNetworkError(err) ? err : undefined,
            attempts: attempt,
            metadata: { ...(err?.metadata || {}), retryable: false },
            body: err?.body,
          }
        );
      }
      await sleepImpl(retryBaseMs * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new LinearTransportError('Linear GraphQL request failed', {
    code: 'NETWORK',
    cause: lastError,
    attempts: maxAttempts,
  });
}

/**
 * Fetch all issues in the configured deterministic intake states for a team.
 * Jovie enables Linear's Triage state; new teams can use Backlog until that
 * workspace-level feature is enabled without changing the control-plane path.
 * Paginates to get all results.
 */
export async function fetchTeamTriageIssues(
  teamId,
  maxResults = 1000,
  stateNames = ['Triage']
) {
  const issues = [];
  let cursor = null;
  while (issues.length < maxResults) {
    const data = await graphql(
      `
      query($teamId: String!, $cursor: String, $stateNames: [String!]!) {
        team(id: $teamId) {
          issues(
            first: 50,
            after: $cursor,
            filter: { state: { name: { in: $stateNames } } }
          ) {
            nodes {
              id
              identifier
              title
              description
              url
              createdAt
              updatedAt
              priority
              estimate
              assignee { id name }
              creator { id name }
              labels { nodes { id name } }
              project { id name slugId }
              parent { id identifier title }
              children { nodes { id identifier title } }
              relations {
                nodes {
                  type
                  relatedIssue { id identifier title }
                }
              }
              state { id name type }
              comments { nodes { id body createdAt } }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    `,
      { teamId, cursor, stateNames }
    );
    const edge = data.team.issues;
    issues.push(...edge.nodes);
    if (!edge.pageInfo.hasNextPage) break;
    cursor = edge.pageInfo.endCursor;
  }
  return issues;
}

/**
 * Fetch an exhaustive active-issue snapshot plus a machine-readable coverage
 * receipt. Callers must not treat a pagination error as an empty team.
 */
export async function fetchTeamActiveIssueSnapshot(
  teamId,
  { graphqlImpl = graphql, maxPages = LINEAR_MAX_PAGES } = {}
) {
  return collectLinearConnectionPages(
    async cursor => {
      const data = await graphqlImpl(
        `
      query($teamId: String!, $cursor: String) {
        team(id: $teamId) {
          issues(
            first: 50,
            after: $cursor,
            filter: {
              state: { name: { in: ["Triage", "Backlog", "Todo", "In Progress", "In Review"] } }
            }
          ) {
            nodes {
              id
              identifier
              title
              description
              url
              createdAt
              updatedAt
              priority
              estimate
              assignee { id name }
              creator { id name }
              labels(first: 50) {
                nodes { id name }
                pageInfo { hasNextPage endCursor }
              }
              project { id name slugId }
              parent { id identifier title }
              children(first: 50) {
                nodes { id identifier title }
                pageInfo { hasNextPage endCursor }
              }
              relations(first: 50) {
                nodes { type relatedIssue { id identifier title } }
                pageInfo { hasNextPage endCursor }
              }
              state { id name type }
              comments(first: 50) {
                nodes { id body createdAt }
                pageInfo { hasNextPage endCursor }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    `,
        { teamId, cursor }
      );
      return data?.team?.issues;
    },
    { maxPages }
  );
}

/** Fetch only the issues while retaining exhaustive snapshot semantics. */
export async function fetchTeamActiveIssues(teamId, options = {}) {
  const snapshot = await fetchTeamActiveIssueSnapshot(teamId, options);
  return snapshot.issues;
}

/**
 * Fetch all unassigned-eligible candidates currently in In Progress, including
 * comments needed for terminal machine-agent evidence and recovery idempotency.
 */
export async function fetchTeamInProgressIssues(teamId, maxResults = 1000) {
  const issues = [];
  let cursor = null;
  while (issues.length < maxResults) {
    const data = await graphql(
      `
      query($teamId: String!, $cursor: String) {
        team(id: $teamId) {
          issues(
            first: 50,
            after: $cursor,
            filter: { state: { name: { eq: "In Progress" } } }
          ) {
            nodes {
              id
              identifier
              title
              description
              url
              createdAt
              updatedAt
              assignee { id name }
              labels { nodes { id name } }
              state { id name type }
              comments { nodes { id body createdAt } }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    `,
      { teamId, cursor }
    );
    const edge = data.team.issues;
    issues.push(...edge.nodes);
    if (!edge.pageInfo.hasNextPage) break;
    cursor = edge.pageInfo.endCursor;
  }
  return issues;
}

/**
 * Fetch the narrow deterministic gate pool. Filtering on readiness labels keeps
 * the five-minute control-plane poll bounded instead of scanning the backlog.
 */
export async function fetchTeamGateCandidates(teamId, maxResults = 500) {
  const issues = [];
  let cursor = null;
  while (issues.length < maxResults) {
    const data = await graphql(
      `
      query($teamId: String!, $cursor: String) {
        team(id: $teamId) {
          issues(
            first: 50,
            after: $cursor,
            filter: {
              state: { name: { in: ["Triage", "Backlog", "Todo"] } },
              labels: { some: { name: { in: ["ready-for-intake", "agent-ready"] } } }
            }
          ) {
            nodes {
              id identifier title description url createdAt updatedAt priority estimate
              assignee { id name }
              creator { id name }
              labels { nodes { id name } }
              project { id name slugId }
              parent { id identifier title }
              children { nodes { id identifier title } }
              relations { nodes { type relatedIssue { id identifier title } } }
              state { id name type }
              comments { nodes { id body createdAt } }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    `,
      { teamId, cursor }
    );
    const edge = data.team.issues;
    issues.push(...edge.nodes);
    if (!edge.pageInfo.hasNextPage) break;
    cursor = edge.pageInfo.endCursor;
  }
  return issues.slice(0, maxResults);
}

/** Fetch possible machine-admission intents for authoritative capacity checks. */
export async function fetchTeamSymphonyIssues(teamId, maxResults = 100) {
  const issues = [];
  let cursor = null;
  while (issues.length < maxResults) {
    const data = await graphql(
      `
      query($teamId: String!, $cursor: String) {
        team(id: $teamId) {
          issues(
            first: 50,
            after: $cursor,
            filter: {
              state: { name: { in: ["Todo", "In Progress", "In Review"] } },
              labels: { some: { name: { eq: "symphony" } } }
            }
          ) {
            nodes {
              id identifier title updatedAt
              assignee { id name }
              labels { nodes { id name } }
              state { id name type }
              comments { nodes { id body createdAt } }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    `,
      { teamId, cursor }
    );
    const edge = data.team.issues;
    issues.push(...edge.nodes);
    if (!edge.pageInfo.hasNextPage) break;
    cursor = edge.pageInfo.endCursor;
  }
  return issues.slice(0, maxResults);
}

/**
 * Fetch a single issue by identifier (e.g. "JOV-1234").
 */
export async function fetchIssue(identifier, options = {}) {
  const value = identifier.trim();
  const issueFields = `
    id identifier title description url createdAt updatedAt priority estimate
    assignee { id name } creator { id name }
    labels { nodes { id name } }
    project { id name slugId }
    parent { id identifier title }
    children { nodes { id identifier title } }
    relations { nodes { type relatedIssue { id identifier title } } }
    state { id name type }
    comments { nodes { id body createdAt } }
  `;
  const keyMatch = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(value);

  // Linear removed issueSearch. Resolve human identifiers through the
  // supported team+number filter, or use the stable UUID directly.
  if (keyMatch) {
    const data = await graphql(
      `query($teamKey: String!, $number: Float!) {
        issues(
          filter: { team: { key: { eq: $teamKey } }, number: { eq: $number } }
          first: 1
        ) { nodes { ${issueFields} } }
      }`,
      { teamKey: keyMatch[1].toUpperCase(), number: Number(keyMatch[2]) },
      options
    );
    return data.issues.nodes[0] || null;
  }

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  ) {
    const data = await graphql(
      `query($id: String!) { issue(id: $id) { ${issueFields} } }`,
      { id: value },
      options
    );
    return data.issue || null;
  }

  throw new Error(`Invalid Linear issue identifier: ${identifier}`);
}

/**
 * Update an issue's labels.
 */
export async function setIssueLabels(issueId, labelIds) {
  return graphql(
    `
    mutation($id: String!, $labelIds: [String!]!) {
      issueUpdate(id: $id, input: { labelIds: $labelIds }) {
        success
      }
    }
  `,
    { id: issueId, labelIds }
  );
}

/**
 * Add a comment to an issue (machine-owned).
 */
export async function addComment(issueId, body) {
  return graphql(
    `
    mutation($id: String!, $body: String!) {
      commentCreate(input: { issueId: $id, body: $body }) {
        success
      }
    }
  `,
    { id: issueId, body }
  );
}

/**
 * Transition an issue to a new state.
 */
export async function transitionIssue(issueId, stateId, options = {}) {
  return graphql(
    `
    mutation($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) {
        success
      }
    }
  `,
    { id: issueId, stateId },
    options
  );
}

export async function fetchTeamLabel(teamId, name) {
  const data = await graphql(
    `
    query($teamId: String!, $name: String!) {
      team(id: $teamId) {
        labels(filter: { name: { eq: $name } }, first: 1) {
          nodes { id name }
        }
      }
    }
  `,
    { teamId, name }
  );
  return data.team.labels.nodes[0] || null;
}

/**
 * Create a relation between two issues.
 */
export async function createRelation(issueId, relatedIssueId, type) {
  return graphql(
    `
    mutation($issueId: String!, $relatedIssueId: String!, $type: String!) {
      relationCreate(input: {
        issueId: $issueId,
        relatedIssueId: $relatedIssueId,
        type: $type
      }) {
        success
      }
    }
  `,
    { issueId, relatedIssueId, type }
  );
}

/**
 * Fetch project info for a given project slugId.
 */
export async function fetchProjectBySlug(slugId) {
  const data = await graphql(
    `
    query($id: String!) {
      project(id: $id) {
        id
        name
        slugId
      }
    }
  `,
    { id: slugId }
  );
  return data.project;
}
