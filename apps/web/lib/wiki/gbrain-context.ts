/**
 * Scoped, truthful GBrain context search (JOV-6557).
 *
 * The daily-driver Context view needs scoped GBrain search with deliberate
 * expansion and honest observation state: a failed or unconfigured search
 * must surface `unavailable` with its reason, never a fake zero-results
 * page. Scope is a namespace prefix (e.g. `ops/`); searching is read-only
 * and never grants write authority. This extends the existing wiki/gbrain
 * client (JOV-3893) — it is not a second knowledge store.
 */

import { type GbrainPage, mcpCall } from '@/lib/wiki/gbrain-client';

export const GBRAIN_CONTEXT_SEARCH_SCHEMA =
  'jovie.ovie.gbrain-context-search/v1' as const;

export const GBRAIN_CONTEXT_SCOPE_ALL = 'all' as const;

/** Default scope: company operations namespace, the daily-driver workspace. */
export const GBRAIN_CONTEXT_DEFAULT_SCOPE = 'ops/' as const;

const SCOPE_PREFIX_RE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*\/$/;

export type GbrainContextScope = string;

export type GbrainContextSearchStatus = 'ok' | 'unavailable';

export type GbrainContextHit = {
  readonly slug: string;
  readonly title: string;
  readonly score?: number;
  readonly chunkText?: string;
};

export type GbrainContextSearchResult =
  | {
      readonly status: 'ok';
      readonly schema: typeof GBRAIN_CONTEXT_SEARCH_SCHEMA;
      readonly query: string;
      readonly scope: GbrainContextScope;
      readonly scopeExpanded: boolean;
      readonly hits: readonly GbrainContextHit[];
    }
  | {
      readonly status: 'unavailable';
      readonly schema: typeof GBRAIN_CONTEXT_SEARCH_SCHEMA;
      readonly query: string;
      readonly scope: GbrainContextScope;
      readonly reason: string;
    };

/** A scope is `all` or a trailing-slash namespace prefix of [a-z0-9-] segments. */
export function isValidGbrainContextScope(scope: string): boolean {
  if (scope === GBRAIN_CONTEXT_SCOPE_ALL) return true;
  return SCOPE_PREFIX_RE.test(scope);
}

/**
 * Expand a raw query into deliberate scope form.
 *
 * The default scope keeps search inside the operations namespace. Expansion
 * to the whole brain is explicit: the caller must pass `all`. An inline
 * `scope:` prefix in the query (e.g. `scope:ops/ shipping latency`) is also
 * honored so keyboard-open scoped search can express expansion without a
 * second field, and the parsed scope is stripped from the search text.
 */
export function resolveGbrainContextScope(input: {
  readonly query: string;
  readonly scope?: string;
}): { readonly query: string; readonly scope: GbrainContextScope } {
  const explicit =
    input.scope !== undefined && input.scope.trim() !== ''
      ? input.scope.trim()
      : null;
  const inlineMatch = input.query.match(
    /^(?:\s*scope:)((?:all|[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*\/))(?:\s+)([\s\S]*)$/
  );
  if (inlineMatch) {
    const inlineScope = inlineMatch[1];
    const rest = inlineMatch[2].trim();
    // An explicit scope argument wins over an inline prefix; the stripped
    // query keeps the operator text out of the search payload.
    if (explicit && isValidGbrainContextScope(explicit)) {
      return { query: rest, scope: explicit };
    }
    return { query: rest, scope: inlineScope };
  }
  if (inlineMatch === null && input.query.trim().startsWith('scope:')) {
    // `scope:` present but malformed — keep the raw text and the default
    // scope; the search itself will surface low relevance, not a silent
    // reinterpretation.
    return {
      query: input.query.trim(),
      scope: GBRAIN_CONTEXT_DEFAULT_SCOPE,
    };
  }
  const scope =
    explicit && isValidGbrainContextScope(explicit)
      ? explicit
      : GBRAIN_CONTEXT_DEFAULT_SCOPE;
  return { query: input.query.trim(), scope };
}

function isInScope(slug: string, scope: GbrainContextScope): boolean {
  if (scope === GBRAIN_CONTEXT_SCOPE_ALL) return true;
  return slug.startsWith(scope);
}

/**
 * Read-only scoped search over the existing GBrain client. Unavailable is
 * honest: an unconfigured key, an unreachable brain, or a malformed response
 * returns `status: 'unavailable'` with the reason — never an empty hit list
 * that would read as a measured zero.
 */
export async function searchGbrainContext(input: {
  readonly query: string;
  readonly scope?: string;
  readonly limit?: number;
}): Promise<GbrainContextSearchResult> {
  const resolved = resolveGbrainContextScope(input);
  const query = resolved.query;
  const scope = resolved.scope;
  if (!query) {
    return {
      status: 'unavailable',
      schema: GBRAIN_CONTEXT_SEARCH_SCHEMA,
      query,
      scope,
      reason: 'query is required',
    };
  }
  const limit =
    typeof input.limit === 'number' && Number.isFinite(input.limit)
      ? Math.min(Math.max(Math.trunc(input.limit), 1), 20)
      : 8;
  const result = await mcpCall<
    Array<{ slug: string; title: string; score?: number; chunk_text?: string }>
  >('search/query', { query, limit });
  if (!result.ok) {
    return {
      status: 'unavailable',
      schema: GBRAIN_CONTEXT_SEARCH_SCHEMA,
      query,
      scope,
      reason: result.reason,
    };
  }
  const hits = (result.data ?? [])
    .filter(hit => isInScope(hit.slug, scope))
    .map(hit => ({
      slug: hit.slug,
      title: hit.title,
      ...(hit.score !== undefined ? { score: hit.score } : {}),
      ...(hit.chunk_text !== undefined ? { chunkText: hit.chunk_text } : {}),
    }));
  // A scoped filter can legitimately produce zero hits after a successful
  // search — that is a measured zero over the scope, and the caller keeps
  // the scope so deliberate expansion stays one explicit action away.
  return {
    status: 'ok',
    schema: GBRAIN_CONTEXT_SEARCH_SCHEMA,
    query,
    scope,
    scopeExpanded: scope === GBRAIN_CONTEXT_SCOPE_ALL,
    hits,
  };
}

/** List a scope's pages with the same honest observation contract. */
export async function listGbrainContextPages(input?: {
  readonly scope?: string;
  readonly limit?: number;
}): Promise<
  | {
      readonly status: 'ok';
      readonly schema: typeof GBRAIN_CONTEXT_SEARCH_SCHEMA;
      readonly scope: GbrainContextScope;
      readonly pages: readonly GbrainPage[];
    }
  | {
      readonly status: 'unavailable';
      readonly schema: typeof GBRAIN_CONTEXT_SEARCH_SCHEMA;
      readonly scope: GbrainContextScope;
      readonly reason: string;
    }
> {
  const scope =
    input?.scope !== undefined && isValidGbrainContextScope(input.scope.trim())
      ? input.scope.trim()
      : GBRAIN_CONTEXT_DEFAULT_SCOPE;
  const limit =
    typeof input?.limit === 'number' && Number.isFinite(input.limit)
      ? Math.min(Math.max(Math.trunc(input.limit), 1), 50)
      : 50;
  if (scope === GBRAIN_CONTEXT_SCOPE_ALL) {
    const result = await mcpCall<GbrainPage[]>('page/list', {
      limit,
      sort: 'updated_desc',
    });
    if (!result.ok) {
      return {
        status: 'unavailable',
        schema: GBRAIN_CONTEXT_SEARCH_SCHEMA,
        scope,
        reason: result.reason,
      };
    }
    return {
      status: 'ok',
      schema: GBRAIN_CONTEXT_SEARCH_SCHEMA,
      scope,
      pages: result.data ?? [],
    };
  }
  const result = await mcpCall<GbrainPage[]>('page/list', {
    limit,
    sort: 'updated_desc',
  });
  if (!result.ok) {
    return {
      status: 'unavailable',
      schema: GBRAIN_CONTEXT_SEARCH_SCHEMA,
      scope,
      reason: result.reason,
    };
  }
  return {
    status: 'ok',
    schema: GBRAIN_CONTEXT_SEARCH_SCHEMA,
    scope,
    pages: (result.data ?? []).filter(page => isInScope(page.slug, scope)),
  };
}
