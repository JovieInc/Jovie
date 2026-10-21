/**
 * The one way to call a third-party API: shared host budget, priority
 * reserves, pacing, bounded full-jitter retries that honor resets, a
 * per-credential circuit breaker, ETag/TTL caching and in-flight coalescing.
 */

import {
  type CachedResponse,
  cacheable,
  cacheKey,
  MemoryResponseCache,
  type ResponseCache,
  toCached,
} from './cache.ts';
import {
  CONTRACT,
  callableSpec,
  type PriorityName,
  priorityPolicy,
  resourceFor,
} from './contract.ts';
import {
  classifyFailure,
  type Failure,
  type FailureKind,
  parseBudget,
} from './headers.ts';
import {
  backoffMs,
  bump,
  type CredentialState,
  credentialState,
  type Decision,
  decide,
  observe,
  recordOutcome,
  refundSpend,
  reserveSpend,
  type SpendDecision,
  type Transition,
} from './policy.ts';
import { credentialLabel, defaultStore, type LedgerStore } from './store.ts';

export const EX_TEMPFAIL = 75;

export type ApiErrorKind = 'shed' | 'budget' | 'exhausted' | 'budget_exhausted';

/** Infrastructure, never a verdict: retry after `retryAt` (exit 75). */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly provider: string;
  readonly retryAt: number | null;
  readonly status: number | null;
  readonly failure: FailureKind | null;
  readonly exitCode = EX_TEMPFAIL;

  constructor(
    kind: ApiErrorKind,
    provider: string,
    message: string,
    extra: {
      retryAt?: number | null;
      status?: number | null;
      failure?: FailureKind | null;
    } = {}
  ) {
    super(`${provider} ${kind}: ${message}`);
    this.name = 'ApiError';
    this.kind = kind;
    this.provider = provider;
    this.retryAt = extra.retryAt ?? null;
    this.status = extra.status ?? null;
    this.failure = extra.failure ?? null;
  }
}

/**
 * Money, not quota: today's spend cap would be exceeded, no cap is configured
 * for a priced call, or the provider answered HTTP 402 (empty wallet). Never
 * retried in-process; `retryAt` is the next UTC day (null for a 402).
 */
export class BudgetExhaustedError extends ApiError {
  readonly priceUsd: number;
  readonly spentUsd: number | null;
  readonly capUsd: number | null;

  constructor(
    provider: string,
    message: string,
    extra: {
      priceUsd: number;
      spentUsd?: number | null;
      capUsd?: number | null;
      retryAt?: number | null;
    }
  ) {
    super('budget_exhausted', provider, message, {
      retryAt: extra.retryAt ?? null,
      status: 402,
    });
    this.name = 'BudgetExhaustedError';
    this.priceUsd = extra.priceUsd;
    this.spentUsd = extra.spentUsd ?? null;
    this.capUsd = extra.capUsd ?? null;
  }
}

export interface ApiResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
  readonly fromCache: 'ttl' | 'etag' | null;
  readonly attempts: number;
  json<T = unknown>(): T;
}

export interface RequestOptions {
  readonly url: string;
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | object;
  readonly priority?: PriorityName;
  readonly costs?: Readonly<Record<string, number>>;
  readonly write?: boolean;
  readonly idempotent?: boolean;
  /** Serve a stored body younger than this without any network call. */
  readonly cacheTtlMs?: number;
  /** Send If-None-Match for GETs (default: provider's conditionalGet). */
  readonly conditional?: boolean;
  readonly coalesce?: boolean;
  readonly maxAttempts?: number;
  readonly maxWaitMs?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  /** USD this call costs; defaults to the provider's pricing.perCallUsd. */
  readonly priceUsd?: number;
}

/** Bridges legacy state files into the ledger (see legacy.ts). */
export interface LedgerHooks {
  prepare?(): Promise<unknown>;
  merge?(state: CredentialState, prepared: unknown, nowMs: number): void;
  publish?(
    state: CredentialState,
    failure: Failure,
    nowMs: number
  ): Promise<void>;
}

export interface ApiClientOptions {
  readonly provider: string;
  /** Stable bucket identity (never the secret). See hashCredential(). */
  readonly credential: string;
  readonly authorize?: (headers: Headers) => void | Promise<void>;
  readonly store?: LedgerStore;
  readonly cache?: ResponseCache;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  readonly log?: (event: Record<string, unknown>) => void;
  readonly hooks?: LedgerHooks;
  /** Per-credential daily USD cap; defaults to the provider's pricing.dailyCapUsd. */
  readonly dailySpendCapUsd?: number;
}

export interface ApiClient {
  readonly provider: string;
  readonly credential: string;
  request(options: RequestOptions): Promise<ApiResponse>;
  state(): Promise<CredentialState | null>;
}

function respond(
  status: number,
  headers: Headers,
  text: string,
  fromCache: ApiResponse['fromCache'],
  attempts: number
): ApiResponse {
  return {
    status,
    headers,
    text,
    fromCache,
    attempts,
    json: <T>() => JSON.parse(text) as T,
  };
}

function fromCached(
  hit: CachedResponse,
  kind: 'ttl' | 'etag',
  attempts: number
): ApiResponse {
  return respond(
    hit.status,
    new Headers(hit.headers),
    hit.body,
    kind,
    attempts
  );
}

function maybeJson(text: string, headers: Headers | undefined): unknown {
  if (!/json/i.test(headers?.get('content-type') ?? '')) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function bodyText(body: string | object | undefined): string | undefined {
  if (body === undefined) return undefined;
  return typeof body === 'string' ? body : JSON.stringify(body);
}

function graphqlQuery(body: string | undefined): string {
  if (!body) return '';
  try {
    const query = (JSON.parse(body) as { query?: unknown }).query;
    return typeof query === 'string' ? query : '';
  } catch {
    return '';
  }
}

const defaultLog = (event: Record<string, unknown>) => {
  process.stderr.write(`${JSON.stringify(event)}\n`);
};

export function createApiClient(options: ApiClientOptions): ApiClient {
  const { provider, credential } = options;
  const spec = callableSpec(provider);
  const spendCap = options.dailySpendCapUsd ?? spec.pricing?.dailyCapUsd;
  const store = options.store ?? defaultStore();
  const cache = options.cache ?? new MemoryResponseCache();
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const random = options.random ?? Math.random;
  const log = options.log ?? defaultLog;
  const inflight = new Map<string, Promise<ApiResponse>>();

  const transition = (t: Transition | null | undefined, at: number) => {
    if (!t) return;
    log({
      schema: 'jovie.api-client.breaker/v1',
      provider,
      credential: credentialLabel(credential),
      ...t,
      at,
    });
  };

  const inLedger = <T>(fn: (state: CredentialState, at: number) => T) =>
    store.transact(provider, ledger => {
      const at = now();
      return fn(credentialState(ledger, credential, at), at);
    });

  async function send(opts: RequestOptions, key: string): Promise<ApiResponse> {
    const method = (opts.method ?? 'GET').toUpperCase();
    const url = new URL(opts.url);
    const body = bodyText(opts.body);
    const isGraphql = url.pathname.endsWith('/graphql');
    const read =
      method === 'GET' ||
      method === 'HEAD' ||
      (isGraphql && !/^\s*mutation\b/.test(graphqlQuery(body)));
    const write = opts.write ?? !read;
    const idempotent =
      opts.idempotent ?? (read || method === 'PUT' || method === 'DELETE');
    const priority = opts.priority ?? 'default';
    const policy = priorityPolicy(priority);
    const resource = resourceFor(provider, url);
    const costs = opts.costs ?? { [resource]: 1 };
    const maxAttempts = opts.maxAttempts ?? CONTRACT.defaults.maxAttempts;
    const deadline =
      now() + (opts.maxWaitMs ?? CONTRACT.defaults.maxWaitMs[policy.class]);
    const conditional =
      method === 'GET' && (opts.conditional ?? spec.conditionalGet === true);
    const price = opts.priceUsd ?? spec.pricing?.perCallUsd ?? 0;

    if (read && opts.cacheTtlMs) {
      const hit = await cache.get(key);
      if (hit && now() - hit.storedAt < opts.cacheTtlMs) {
        await inLedger((s, at) => bump(s, priority, 'cacheHits', at));
        return fromCached(hit, 'ttl', 0);
      }
    }

    for (let attempt = 0; ; ) {
      const prepared = await options.hooks?.prepare?.();
      let denied: SpendDecision | null = null;
      const decision: Decision = await inLedger((s, at) => {
        options.hooks?.merge?.(s, prepared, at);
        const d = decide(
          s,
          {
            priority,
            costs,
            write,
            minWriteIntervalMs: spec.minWriteIntervalMs,
          },
          at
        );
        if (d.action === 'shed') bump(s, priority, 'shed', at);
        if (d.action === 'wait') bump(s, priority, 'waited', at);
        if (d.action === 'go' && attempt > 0) bump(s, priority, 'retries', at);
        if (d.action === 'go' && price > 0) {
          const spend = reserveSpend(s, price, spendCap, at);
          if (!spend.ok) denied = spend;
        }
        return d;
      });
      transition(decision.transition, now());
      const spendDenied = denied as SpendDecision | null;
      if (spendDenied && !spendDenied.ok) {
        log({
          schema: 'jovie.api-client.spend/v1',
          provider,
          credential: credentialLabel(credential),
          outcome: 'budget_exhausted',
          priceUsd: price,
          spentUsd: spendDenied.spentUsd,
          capUsd: spendDenied.capUsd,
          at: now(),
        });
        throw new BudgetExhaustedError(
          provider,
          spendDenied.capUsd == null
            ? `priced call ($${price}) with no daily spend cap configured`
            : `daily spend cap $${spendDenied.capUsd} reached ($${spendDenied.spentUsd} spent, call costs $${price})`,
          {
            priceUsd: price,
            spentUsd: spendDenied.spentUsd,
            capUsd: spendDenied.capUsd,
            retryAt: spendDenied.retryAt,
          }
        );
      }
      if (decision.action === 'shed') {
        throw new ApiError(
          'shed',
          provider,
          `${priority} shed (${decision.reason})`,
          { retryAt: decision.until }
        );
      }
      if (decision.action === 'wait') {
        const until = decision.until ?? now() + 1000;
        if (until > deadline) {
          throw new ApiError(
            'budget',
            provider,
            `${priority} would wait past its budget (${decision.reason})`,
            { retryAt: until }
          );
        }
        await sleep(Math.max(0, until - now()) + Math.floor(random() * 250));
        continue;
      }
      attempt += 1;
      const headers = new Headers(opts.headers);
      await options.authorize?.(headers);
      const stored =
        conditional || opts.cacheTtlMs ? await cache.get(key) : null;
      if (conditional && stored?.etag)
        headers.set('if-none-match', stored.etag);
      else if (conditional && stored?.lastModified)
        headers.set('if-modified-since', stored.lastModified);
      const timeout = AbortSignal.timeout(
        opts.timeoutMs ?? CONTRACT.defaults.timeoutMs
      );
      let response: Response | null = null;
      let text = '';
      try {
        response = await fetchImpl(url, {
          method,
          headers,
          body,
          signal: opts.signal
            ? AbortSignal.any([timeout, opts.signal])
            : timeout,
        });
        text = await response.text();
      } catch (error) {
        if (opts.signal?.aborted) throw error;
        response = null;
      }
      const at = now();
      const notModified = response?.status === 304 && stored !== null;
      const failure: Failure = notModified
        ? { kind: 'none', retryAtMs: null }
        : classifyFailure(spec, {
            status: response?.status ?? null,
            headers: response?.headers,
            body: maybeJson(text, response?.headers),
            text,
            networkError: response === null,
            nowMs: at,
          });
      const observations = response
        ? parseBudget(spec, response.headers, at, resource)
        : [];
      const paidFailed =
        price > 0 &&
        !notModified &&
        (response === null || response.status >= 400);
      const outcome = await inLedger((s, t) => {
        if (paidFailed) refundSpend(s, price, t);
        observe(s, observations, t);
        if (notModified) bump(s, priority, 'notModified', t);
        return {
          change: recordOutcome(
            s,
            {
              priority,
              resource: observations[0]?.resource ?? resource,
              failure,
              probe: decision.probe,
            },
            t
          ),
          state: s,
          at: t,
        };
      });
      transition(outcome.change, at);
      await options.hooks?.publish?.(outcome.state, failure, outcome.at);
      if (response?.status === 402) {
        throw new BudgetExhaustedError(
          provider,
          `${method} ${url.pathname} answered 402 (provider wallet or plan exhausted)`,
          { priceUsd: price }
        );
      }
      if (response && (failure.kind === 'none' || failure.kind === 'client')) {
        if (notModified && stored) return fromCached(stored, 'etag', attempt);
        if (
          read &&
          (conditional || opts.cacheTtlMs) &&
          cacheable(response.status, response.headers, text)
        ) {
          await cache.set(
            key,
            toCached(response.status, response.headers, text, at)
          );
        }
        return respond(response.status, response.headers, text, null, attempt);
      }
      const retryable =
        failure.kind === 'primary' ||
        failure.kind === 'secondary' ||
        (failure.kind === 'transient' && idempotent);
      const delay = backoffMs(attempt, failure, now(), random);
      if (!retryable || attempt >= maxAttempts || now() + delay > deadline) {
        throw new ApiError(
          'exhausted',
          provider,
          `${method} ${url.pathname} ${failure.kind} after ${attempt} attempt(s)`,
          {
            retryAt: failure.retryAtMs,
            status: response?.status ?? null,
            failure: failure.kind,
          }
        );
      }
      await sleep(delay);
    }
  }

  return {
    provider,
    credential,
    request(opts) {
      const method = (opts.method ?? 'GET').toUpperCase();
      const body = bodyText(opts.body) ?? '';
      const key = cacheKey([
        provider,
        credential,
        method,
        opts.url,
        opts.headers?.accept ?? '',
        method === 'GET' ? '' : body,
      ]);
      const read =
        method === 'GET' ||
        (method === 'POST' &&
          new URL(opts.url).pathname.endsWith('/graphql') &&
          !/^\s*mutation\b/.test(graphqlQuery(body)));
      if (!read || opts.coalesce === false) return send(opts, key);
      const pending = inflight.get(key);
      if (pending) return pending;
      const promise = send(opts, key).finally(() => inflight.delete(key));
      inflight.set(key, promise);
      return promise;
    },
    async state() {
      const ledger = await store.read(provider);
      return ledger.credentials[credential] ?? null;
    },
  };
}
