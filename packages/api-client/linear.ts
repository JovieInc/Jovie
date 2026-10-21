/**
 * Linear adapter: one GraphQL transport on the shared ledger, the lanes
 * cooldown scope as credential identity, and aliased batch reads.
 */
import {
  type ApiClient,
  type ApiClientOptions,
  createApiClient,
  type RequestOptions,
} from './client.ts';
import { linearLegacyHooks } from './legacy.ts';
import { defaultStateRoot, hashCredential } from './store.ts';

export const LINEAR_API_URL = 'https://api.linear.app/graphql';
export const LINEAR_BATCH_SIZE = 50;

type CallOptions = Omit<RequestOptions, 'url' | 'method' | 'body'>;

export interface LinearClientOptions
  extends Omit<ApiClientOptions, 'provider' | 'credential' | 'authorize'> {
  /**
   * Cooldown/budget identity: the API key itself, or `linear-app:<client id>`
   * for the OAuth app whose token rotates. Never written anywhere raw.
   */
  readonly identity: string;
  /** Authorization header value; receives the rejected value after a 401. */
  readonly authorization: (rejected?: string) => string | Promise<string>;
  /** Bridge lanes cooldown + api-budget.json under this root (default: host state). */
  readonly legacyStateRoot?: string | null;
}

export class LinearGraphQLError extends Error {
  readonly errors: readonly unknown[];

  constructor(errors: readonly unknown[]) {
    const first = errors[0] as { message?: unknown } | undefined;
    super(`Linear GraphQL: ${String(first?.message ?? 'error')}`);
    this.name = 'LinearGraphQLError';
    this.errors = errors;
  }
}

export interface LinearClient {
  readonly client: ApiClient;
  readonly scope: string;
  graphql<T>(
    query: string,
    variables?: Record<string, unknown>,
    options?: CallOptions
  ): Promise<T>;
  batch<T>(
    keys: readonly string[],
    field: (key: string) => string,
    options?: CallOptions
  ): Promise<Map<string, T | null>>;
}

export function linearScope(identity: string): string {
  return hashCredential(LINEAR_API_URL, identity);
}

export function createLinearClient(options: LinearClientOptions): LinearClient {
  const scope = linearScope(options.identity);
  const legacyRoot =
    options.legacyStateRoot === undefined
      ? defaultStateRoot()
      : options.legacyStateRoot;
  let current: string | undefined;
  const client = createApiClient({
    ...options,
    provider: 'linear',
    credential: scope,
    hooks:
      options.hooks ??
      (legacyRoot ? linearLegacyHooks(legacyRoot, scope) : undefined),
    authorize: async headers => {
      current ??= await options.authorization();
      headers.set('authorization', current);
      headers.set('content-type', 'application/json');
    },
  });

  const raw = async <T>(
    query: string,
    variables: Record<string, unknown>,
    opts: CallOptions
  ) => {
    const send = () =>
      client.request({
        ...opts,
        url: LINEAR_API_URL,
        method: 'POST',
        body: { query, variables },
      });
    let res = await send();
    if (res.status === 401 && current !== undefined) {
      current = await options.authorization(current);
      res = await send();
    }
    return res.json<{ data?: T | null; errors?: unknown[] }>();
  };
  const graphql = async <T>(
    query: string,
    variables: Record<string, unknown> = {},
    opts: CallOptions = {}
  ) => {
    const payload = await raw<T>(query, variables, opts);
    if (payload.errors?.length) throw new LinearGraphQLError(payload.errors);
    return payload.data as T;
  };

  return {
    client,
    scope,
    graphql,
    async batch<T>(
      keys: readonly string[],
      field: (key: string) => string,
      opts: CallOptions = {}
    ) {
      const out = new Map<string, T | null>();
      const unique = [...new Set(keys)];
      for (let i = 0; i < unique.length; i += LINEAR_BATCH_SIZE) {
        const chunk = unique.slice(i, i + LINEAR_BATCH_SIZE);
        const query = `query { ${chunk.map((key, j) => `k${j}: ${field(key)}`).join('\n')} }`;
        // Per-alias misses (deleted issue, unknown PR) come back as null + errors.
        const payload = await raw<Record<string, T | null>>(query, {}, opts);
        if (!payload.data) throw new LinearGraphQLError(payload.errors ?? []);
        const data = payload.data;
        chunk.forEach((key, j) => out.set(key, data[`k${j}`] ?? null));
      }
      return out;
    },
  };
}

/** `issue(id: "JOV-1") { ... }` for a batch() call; identifiers and UUIDs both work. */
export function issueField(selection: string) {
  return (id: string) => `issue(id: ${JSON.stringify(id)}) { ${selection} }`;
}
