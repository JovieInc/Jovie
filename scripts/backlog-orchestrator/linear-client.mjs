/**
 * Minimal Linear GraphQL client for backlog orchestrator.
 *
 * Deterministic wrapper around Linear's public API.
 * No SDK — bare fetch with the team's API key env var.
 */

export const LINEAR_API_KEY_ENV = 'LINEAR_API_KEY';

const API_URL = 'https://api.linear.app/graphql';

function requireKey() {
  const key = process.env[LINEAR_API_KEY_ENV];
  if (!key) throw new Error(`${LINEAR_API_KEY_ENV} not set`);
  return key;
}

export async function graphql(query, variables = {}) {
  const key = requireKey();
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = /** @type {any} */ (await resp.json());
  if (data.errors) {
    throw new Error(
      `Linear API error: ${data.errors.map(e => e.message).join('; ')}`
    );
  }
  return data.data;
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
export async function fetchIssue(identifier) {
  const data = await graphql(
    `
    query($identifier: String!) {
      issueSearch(query: $identifier, first: 1) {
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
      }
    }
  `,
    { identifier }
  );
  return data.issueSearch.nodes[0] || null;
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
