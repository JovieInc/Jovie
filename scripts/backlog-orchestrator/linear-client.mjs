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

export class LinearTransportError extends Error {
  /** @param {string} message @param {any} [options] */
  constructor(message, { code, cause, attempts } = {}) {
    super(message, { cause });
    this.name = 'LinearTransportError';
    this.code = code;
    this.attempts = attempts;
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
  return errors.some(error =>
    [error?.message, error?.extensions?.userPresentableMessage]
      .filter(Boolean)
      .some(message => /deprecated/i.test(message))
  )
    ? 'DEPRECATED'
    : 'API';
}

/**
 * Bounded, retrying GraphQL transport. Only the API key is sent as the
 * normal Linear `Authorization: <key>` header; it is never logged or exposed
 * in an error. Retry is limited to transient network/timeout failures.
 */
export async function graphql(
  query,
  variables = {},
  {
    fetchImpl = globalThis.fetch,
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
      const data = /** @type {any} */ (await resp.json());
      if (data.errors) {
        const error = /** @type {any} */ (
          new Error(
            `Linear API error: ${data.errors.map(e => e.message).join('; ')}`
          )
        );
        error.code = classifyGraphQLErrors(data.errors);
        throw error;
      }
      return data.data;
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || attempt === maxAttempts) {
        const code =
          error?.name === 'AbortError' || error?.name === 'TimeoutError'
            ? 'TIMEOUT'
            : isTransientNetworkError(error)
              ? 'NETWORK'
              : error?.code === 'DEPRECATED'
                ? 'DEPRECATED'
                : 'API';
        throw new LinearTransportError(
          `Linear GraphQL request failed (${code.toLowerCase()}, attempts=${attempt})`,
          { code, cause: error, attempts: attempt }
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
 * Fetch all issues in Triage state for a team.
 * Paginates to get all results.
 */
export async function fetchTeamTriageIssues(teamId, maxResults = 1000) {
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
            filter: { state: { name: { eq: "Triage" } } }
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
 * Fetch issues in specific states (Triage, Backlog, Todo, In Progress, In Review).
 */
export async function fetchTeamActiveIssues(teamId, maxResults = 1000) {
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
              labels { nodes { id name } }
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
  return issues;
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
export async function transitionIssue(issueId, stateId) {
  return graphql(
    `
    mutation($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) {
        success
      }
    }
  `,
    { id: issueId, stateId }
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
