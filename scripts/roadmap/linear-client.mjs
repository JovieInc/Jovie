/**
 * Linear GraphQL client for /roadmap.
 * Accepts an optional `fetch` for tests; production uses global fetch + LINEAR_API_KEY.
 */

import {
  AGENTOS_INITIATIVE_NAME,
  LABEL_AGENTOS,
  TEAM_ID,
  TEAM_KEY,
} from './config.mjs';

export const LINEAR_API_KEY_ENV = 'LINEAR_API_KEY';
const API_URL = 'https://api.linear.app/graphql';

/**
 * @param {{ apiKey?: string, fetchImpl?: typeof fetch }} [opts]
 */
export function createLinearClient(opts = {}) {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const apiKey = opts.apiKey ?? process.env[LINEAR_API_KEY_ENV];

  /**
   * @param {string} query
   * @param {Record<string, unknown>} [variables]
   */
  async function graphql(query, variables = {}) {
    if (!apiKey) {
      throw new Error(`${LINEAR_API_KEY_ENV} not set`);
    }
    if (typeof fetchImpl !== 'function') {
      throw new Error('fetch is not available');
    }
    const resp = await fetchImpl(API_URL, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(
        `Linear API request failed (${resp.status} ${resp.statusText}): ${body}`
      );
    }
    /** @type {{ data?: any, errors?: Array<{ message: string }> }} */
    const data = await resp.json();
    if (data.errors?.length) {
      throw new Error(
        `Linear API error: ${data.errors.map(/** @param {{message:string}} e */ e => e.message).join('; ')}`
      );
    }
    return data.data;
  }

  /**
   * Fetch AgentOS initiative (by name) with projects.
   */
  async function fetchInitiative(name = AGENTOS_INITIATIVE_NAME) {
    // Linear GraphQL: initiatives connection may require org-level access.
    // Fall back to team projects filtered by name if initiatives are unavailable.
    try {
      const data = await graphql(
        `query($name: String!) {
          initiatives(filter: { name: { eq: $name } }, first: 1) {
            nodes {
              id
              name
              url
              projects {
                nodes {
                  id
                  name
                  url
                  status { name type }
                }
              }
            }
          }
        }`,
        { name }
      );
      const node = data?.initiatives?.nodes?.[0] ?? null;
      if (node) return node;
    } catch {
      // fall through
    }

    // Fallback: invent a synthetic initiative envelope from team projects
    // whose name or description references AgentOS, plus all team projects
    // labeled under agentos work.
    const projects = await fetchTeamProjects();
    return {
      id: 'synthetic-agentos',
      name: AGENTOS_INITIATIVE_NAME,
      url: 'https://linear.app/jovie/initiative/agentos-1838d0d6b914',
      projects: { nodes: projects },
      _synthetic: true,
    };
  }

  async function fetchTeamProjects() {
    const data = await graphql(
      `query($teamId: String!) {
        team(id: $teamId) {
          projects(first: 100) {
            nodes {
              id
              name
              url
              status { name type }
            }
          }
        }
      }`,
      { teamId: TEAM_ID }
    );
    return data?.team?.projects?.nodes ?? [];
  }

  /**
   * Active + recently completed agentos-labeled issues for the team.
   * @param {{ maxResults?: number, label?: string }} [opts]
   */
  async function fetchAgentOsIssues(opts = {}) {
    const maxResults = opts.maxResults ?? 500;
    const label = opts.label ?? LABEL_AGENTOS;
    /** @type {object[]} */
    const issues = [];
    let cursor = null;
    while (issues.length < maxResults) {
      const data = await graphql(
        `query($teamId: String!, $cursor: String, $label: String!) {
          team(id: $teamId) {
            issues(
              first: 50
              after: $cursor
              filter: {
                labels: { name: { eq: $label } }
                state: {
                  type: { nin: ["canceled"] }
                }
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
                assignee { id name }
                labels { nodes { id name } }
                parent { id identifier }
                project { id name }
                state { id name type }
                relations {
                  nodes {
                    type
                    relatedIssue { id identifier title }
                  }
                }
                attachments { nodes { url } }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }`,
        { teamId: TEAM_ID, cursor, label }
      );
      const edge = data?.team?.issues;
      if (!edge) break;
      issues.push(...edge.nodes);
      if (!edge.pageInfo.hasNextPage) break;
      cursor = edge.pageInfo.endCursor;
    }
    return issues;
  }

  /**
   * @param {string} identifier  e.g. JOV-1932
   */
  async function fetchIssueByIdentifier(identifier) {
    const m = String(identifier).match(/^(?:JOV-)?(\d+)$/i);
    if (!m) {
      throw new Error(`Invalid issue identifier: ${identifier}`);
    }
    const number = Number.parseInt(m[1], 10);
    const data = await graphql(
      `query($n: Float!) {
        issues(
          filter: { team: { key: { eq: "JOV" } }, number: { eq: $n } }
          first: 1
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
            assignee { id name }
            labels { nodes { id name } }
            parent { id identifier }
            project { id name url }
            state { id name type }
            children { nodes { id identifier title state { name type } } }
            relations {
              nodes {
                type
                relatedIssue { id identifier title state { name type } }
              }
            }
            attachments { nodes { url } }
            team { id key }
          }
        }
      }`,
      { n: number }
    );
    return data?.issues?.nodes?.[0] ?? null;
  }

  /**
   * Resolve label IDs by name on the JOV team.
   * @param {readonly string[]} names
   */
  async function resolveLabelIds(names) {
    if (names.length === 0) return [];
    const data = await graphql(
      `query($teamId: String!) {
        team(id: $teamId) {
          labels(first: 250) { nodes { id name } }
        }
      }`,
      { teamId: TEAM_ID }
    );
    const byName = new Map(
      (data?.team?.labels?.nodes ?? []).map(
        /** @param {{id:string,name:string}} n */ n => [
          n.name.toLowerCase(),
          n.id,
        ]
      )
    );
    /** @type {string[]} */
    const ids = [];
    for (const name of names) {
      const id = byName.get(name.toLowerCase());
      if (id) ids.push(id);
    }
    return ids;
  }

  /**
   * @param {string} projectRef  slug or id
   */
  async function resolveProjectId(projectRef) {
    if (!projectRef) return null;
    // UUID-ish
    if (/^[0-9a-f-]{20,}$/i.test(projectRef)) return projectRef;
    const projects = await fetchTeamProjects();
    const slug = projectRef.toLowerCase();
    const hit = projects.find(p => {
      const nameSlug = String(p.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      return nameSlug === slug || p.name.toLowerCase() === slug;
    });
    return hit?.id ?? null;
  }

  /**
   * @param {{
   *   title: string,
   *   description?: string,
   *   priority?: number,
   *   parentId?: string|null,
   *   projectId?: string|null,
   *   labelNames?: string[],
   * }} input
   */
  async function createIssue(input) {
    const labelNames = [
      LABEL_AGENTOS,
      ...(input.labelNames ?? []).filter(n => n && n !== LABEL_AGENTOS),
    ];
    const labelIds = await resolveLabelIds(labelNames);
    const data = await graphql(
      `mutation($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier url title }
        }
      }`,
      {
        input: {
          teamId: TEAM_ID,
          title: input.title,
          description: input.description ?? '',
          ...(typeof input.priority === 'number'
            ? { priority: input.priority }
            : {}),
          ...(input.parentId ? { parentId: input.parentId } : {}),
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(labelIds.length ? { labelIds } : {}),
        },
      }
    );
    if (!data?.issueCreate?.success) {
      throw new Error('issueCreate returned success=false');
    }
    return data.issueCreate.issue;
  }

  return {
    graphql,
    fetchInitiative,
    fetchTeamProjects,
    fetchAgentOsIssues,
    fetchIssueByIdentifier,
    resolveLabelIds,
    resolveProjectId,
    createIssue,
    teamId: TEAM_ID,
    teamKey: TEAM_KEY,
  };
}

/**
 * @typedef {ReturnType<typeof createLinearClient>} LinearClient
 */
