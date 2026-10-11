import 'server-only';

import { env } from '@/lib/env-server';
import { resolveHudGithubToken } from '@/lib/github/hud-token.server';
import { serverFetch } from '@/lib/http/server-fetch';

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';
const GITHUB_API_URL = 'https://api.github.com';

export const OVIE_LINEAR_TEAM_KEY = 'JOV' as const;
export const OVIE_LINEAR_TEAM_ID =
  'bdc09edc-f91c-4a06-b308-74b4fcf093f8' as const;
export const OVIE_GITHUB_REPOSITORY = 'JovieInc/Jovie' as const;

export type OvieWorkListState = 'open' | 'closed' | 'all';

type FounderWorkDeps = {
  readonly linearApiKey: () => string | undefined;
  readonly githubToken: () => Promise<string | undefined>;
  readonly request: typeof serverFetch;
};

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return typeof value === 'object' && value !== null
    ? (value as RecordValue)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function labels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(label => {
    if (typeof label === 'string') return [label];
    const name = stringValue(asRecord(label)?.name);
    return name ? [name] : [];
  });
}

function actorLogin(value: unknown): string | null {
  return stringValue(asRecord(value)?.login);
}

function linearIssue(value: unknown) {
  const issue = asRecord(value);
  const state = asRecord(issue?.state);
  const assignee = asRecord(issue?.assignee);
  if (
    !issue ||
    !stringValue(issue.id) ||
    !stringValue(issue.identifier) ||
    !stringValue(issue.title) ||
    !stringValue(issue.url)
  ) {
    return null;
  }
  return {
    id: stringValue(issue.id),
    identifier: stringValue(issue.identifier),
    title: stringValue(issue.title),
    url: stringValue(issue.url),
    priority: numberValue(issue.priority),
    priorityLabel: stringValue(issue.priorityLabel),
    state: {
      name: stringValue(state?.name),
      type: stringValue(state?.type),
    },
    assignee: stringValue(assignee?.name),
    createdAt: stringValue(issue.createdAt),
    updatedAt: stringValue(issue.updatedAt),
  };
}

function githubPullRequest(value: unknown, includeBody: boolean) {
  const pull = asRecord(value);
  const head = asRecord(pull?.head);
  const base = asRecord(pull?.base);
  const number = numberValue(pull?.number);
  const title = stringValue(pull?.title);
  const url = stringValue(pull?.html_url);
  if (!pull || number === null || !title || !url) return null;
  return {
    number,
    title,
    url,
    state: stringValue(pull.state),
    draft: pull.draft === true,
    author: actorLogin(pull.user),
    labels: labels(pull.labels),
    head: stringValue(head?.ref),
    base: stringValue(base?.ref),
    createdAt: stringValue(pull.created_at),
    updatedAt: stringValue(pull.updated_at),
    mergedAt: stringValue(pull.merged_at),
    ...(includeBody ? { body: stringValue(pull.body) } : {}),
  };
}

function githubIssue(value: unknown, includeBody: boolean) {
  const issue = asRecord(value);
  const number = numberValue(issue?.number);
  const title = stringValue(issue?.title);
  const url = stringValue(issue?.html_url);
  if (!issue || number === null || !title || !url || issue.pull_request) {
    return null;
  }
  return {
    number,
    title,
    url,
    state: stringValue(issue.state),
    stateReason: stringValue(issue.state_reason),
    author: actorLogin(issue.user),
    labels: labels(issue.labels),
    createdAt: stringValue(issue.created_at),
    updatedAt: stringValue(issue.updated_at),
    closedAt: stringValue(issue.closed_at),
    ...(includeBody ? { body: stringValue(issue.body) } : {}),
  };
}

export function createFounderWorkReader(deps: FounderWorkDeps) {
  async function linearGraphql<T>(
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    const apiKey = deps.linearApiKey();
    if (!apiKey) throw new Error('LINEAR_API_KEY is not configured');
    const response = await deps.request(LINEAR_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'Jovie-Ovie-MCP/1.0',
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
      context: 'Ovie Linear issue list',
      timeoutMs: 10_000,
      retry: { maxRetries: 1, baseDelayMs: 250 },
    });
    if (!response.ok) throw new Error(`Linear API error (${response.status})`);
    const payload = (await response.json()) as {
      data?: T;
      errors?: Array<{ message?: string }>;
    };
    if (payload.errors?.length) {
      throw new Error(payload.errors[0]?.message ?? 'Linear GraphQL error');
    }
    if (!payload.data) throw new Error('Linear GraphQL returned empty data');
    return payload.data;
  }

  async function githubJson(path: string): Promise<unknown> {
    const token = await deps.githubToken();
    if (!token) throw new Error('GitHub read credentials are not configured');
    const response = await deps.request(`${GITHUB_API_URL}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Jovie-Ovie-MCP/1.0',
      },
      cache: 'no-store',
      context: 'Ovie GitHub work read',
      timeoutMs: 10_000,
      retry: { maxRetries: 1, baseDelayMs: 250 },
    });
    if (!response.ok) throw new Error(`GitHub API error (${response.status})`);
    return response.json();
  }

  return {
    async listLinearIssues(limit: number) {
      const data = await linearGraphql<{
        issues?: { nodes?: unknown[] };
      }>(
        `query OvieJovieIssues($first: Int!) {
          issues(
            filter: { team: { key: { eq: "JOV" } } }
            first: $first
            orderBy: updatedAt
          ) {
            nodes {
              id identifier title url priority priorityLabel createdAt updatedAt
              state { name type }
              assignee { name }
            }
          }
        }`,
        { first: limit }
      );
      return (data.issues?.nodes ?? [])
        .map(linearIssue)
        .filter((issue): issue is NonNullable<typeof issue> => issue !== null);
    },

    async listGithubPullRequests(state: OvieWorkListState, limit: number) {
      const query = new URLSearchParams({
        state,
        sort: 'updated',
        direction: 'desc',
        per_page: String(limit),
      });
      const payload = await githubJson(
        `/repos/JovieInc/Jovie/pulls?${query.toString()}`
      );
      return (Array.isArray(payload) ? payload : [])
        .map(item => githubPullRequest(item, false))
        .filter((pull): pull is NonNullable<typeof pull> => pull !== null);
    },

    async getGithubPullRequest(number: number) {
      return githubPullRequest(
        await githubJson(`/repos/JovieInc/Jovie/pulls/${number}`),
        true
      );
    },

    async listGithubIssues(state: OvieWorkListState, limit: number) {
      const qualifier = state === 'all' ? '' : ` is:${state}`;
      const query = new URLSearchParams({
        q: `repo:${OVIE_GITHUB_REPOSITORY} is:issue${qualifier}`,
        sort: 'updated',
        order: 'desc',
        per_page: String(limit),
      });
      const payload = asRecord(
        await githubJson(`/search/issues?${query.toString()}`)
      );
      const items = Array.isArray(payload?.items) ? payload.items : [];
      return items
        .map(item => githubIssue(item, false))
        .filter((issue): issue is NonNullable<typeof issue> => issue !== null);
    },

    async getGithubIssue(number: number) {
      return githubIssue(
        await githubJson(`/repos/JovieInc/Jovie/issues/${number}`),
        true
      );
    },
  };
}

export type FounderWorkReader = ReturnType<typeof createFounderWorkReader>;

export function createLiveFounderWorkReader(): FounderWorkReader {
  return createFounderWorkReader({
    linearApiKey: () => env.LINEAR_API_KEY,
    githubToken: () => resolveHudGithubToken(),
    request: serverFetch,
  });
}
