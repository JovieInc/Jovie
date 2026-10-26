/**
 * GitHub adapter: REST with ETag reuse, GraphQL with RATE_LIMITED handling,
 * Link pagination, and aliased batch reads instead of one call per PR.
 */
import {
  type ApiClient,
  type ApiClientOptions,
  type ApiResponse,
  createApiClient,
  type RequestOptions,
} from './client.ts';
import { hashCredential } from './store.ts';

export const GITHUB_API = 'https://api.github.com';
export const GRAPHQL_BATCH_SIZE = 50;

type CallOptions = Omit<RequestOptions, 'url' | 'method' | 'body'>;

export interface GitHubClientOptions
  extends Omit<ApiClientOptions, 'provider' | 'credential' | 'authorize'> {
  readonly token: string | (() => string | Promise<string>);
  /**
   * The rate-limit bucket. Installation tokens rotate hourly but share one
   * bucket, so pass `app-installation:<id>`; defaults to a hash of the token.
   */
  readonly credential?: string;
}

export class GraphQLError extends Error {
  readonly errors: readonly unknown[];

  constructor(errors: readonly unknown[]) {
    const first = errors[0] as { message?: unknown } | undefined;
    super(`GitHub GraphQL: ${String(first?.message ?? 'error')}`);
    this.name = 'GraphQLError';
    this.errors = errors;
  }
}

export interface GitHubClient {
  readonly client: ApiClient;
  rest(
    method: string,
    path: string,
    body?: unknown,
    options?: CallOptions
  ): Promise<ApiResponse>;
  graphql<T>(
    query: string,
    variables?: Record<string, unknown>,
    options?: CallOptions
  ): Promise<T>;
  paginate<T>(
    path: string,
    options?: CallOptions & { maxPages?: number }
  ): Promise<T[]>;
  batch<T>(
    keys: readonly string[],
    field: (key: string) => string,
    options?: CallOptions
  ): Promise<Map<string, T | null>>;
}

function nextLink(header: string | null): string | null {
  const match = header?.split(',').find(part => /rel="next"/.test(part));
  return match ? (/<([^>]+)>/.exec(match)?.[1] ?? null) : null;
}

export function createGitHubClient(options: GitHubClientOptions): GitHubClient {
  const tokenOf = async () =>
    typeof options.token === 'function' ? options.token() : options.token;
  const credential =
    options.credential ??
    (typeof options.token === 'string'
      ? hashCredential('github', options.token)
      : 'github-default');
  const client = createApiClient({
    ...options,
    provider: 'github',
    credential,
    authorize: async headers => {
      headers.set('authorization', `Bearer ${await tokenOf()}`);
      if (!headers.has('accept'))
        headers.set('accept', 'application/vnd.github+json');
      headers.set('x-github-api-version', '2022-11-28');
    },
  });
  const url = (path: string) =>
    path.startsWith('http') ? path : `${GITHUB_API}/${path.replace(/^\//, '')}`;

  const raw = async <T>(
    query: string,
    variables: Record<string, unknown>,
    opts: CallOptions
  ) => {
    const res = await client.request({
      ...opts,
      url: `${GITHUB_API}/graphql`,
      method: 'POST',
      body: { query, variables },
    });
    return res.json<{ data?: T | null; errors?: unknown[] }>();
  };
  const graphql = async <T>(
    query: string,
    variables: Record<string, unknown> = {},
    opts: CallOptions = {}
  ) => {
    const payload = await raw<T>(query, variables, opts);
    if (payload.errors?.length) throw new GraphQLError(payload.errors);
    return payload.data as T;
  };

  return {
    client,
    rest: (method, path, body, opts = {}) =>
      client.request({ ...opts, url: url(path), method, body: body as object }),
    graphql,
    async paginate<T>(
      path: string,
      opts: CallOptions & { maxPages?: number } = {}
    ) {
      const items: T[] = [];
      let next: string | null = url(path);
      for (let page = 0; next && page < (opts.maxPages ?? 50); page += 1) {
        const res = await client.request({ ...opts, url: next });
        const body = res.json<T[] | Record<string, unknown>>();
        const rows = Array.isArray(body)
          ? body
          : (Object.values(body).find(Array.isArray) as T[] | undefined);
        items.push(...(rows ?? []));
        next = nextLink(res.headers.get('link'));
      }
      return items;
    },
    async batch<T>(
      keys: readonly string[],
      field: (key: string) => string,
      opts: CallOptions = {}
    ) {
      const out = new Map<string, T | null>();
      const unique = [...new Set(keys)];
      for (let i = 0; i < unique.length; i += GRAPHQL_BATCH_SIZE) {
        const chunk = unique.slice(i, i + GRAPHQL_BATCH_SIZE);
        const query = `query { ${chunk.map((key, j) => `k${j}: ${field(key)}`).join('\n')} }`;
        // Per-alias misses (deleted issue, unknown PR) come back as null + errors.
        const payload = await raw<Record<string, T | null>>(query, {}, opts);
        if (!payload.data) throw new GraphQLError(payload.errors ?? []);
        const data = payload.data;
        chunk.forEach((key, j) => out.set(key, data[`k${j}`] ?? null));
      }
      return out;
    },
  };
}

/** `repository(owner,name){ pullRequest(number) { ... } }` for a batch() call. */
export function pullRequestField(
  owner: string,
  repo: string,
  selection: string
) {
  return (number: string) =>
    `repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(repo)}) { pullRequest(number: ${Number(number)}) { ${selection} } }`;
}
