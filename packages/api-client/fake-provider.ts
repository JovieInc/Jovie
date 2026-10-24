/**
 * A fetch-compatible fake provider with a real budget, resets, ETags and
 * scripted faults (429, secondary limits, 5xx, network). Every adapter test
 * runs against limit behavior, not only the happy path.
 */
import { createHash } from 'node:crypto';

export class FakeClock {
  now: number;

  constructor(start = Date.UTC(2026, 9, 20, 12, 0, 0)) {
    this.now = start;
  }

  readonly read = () => this.now;
  readonly sleep = async (ms: number) => {
    this.now += Math.max(0, ms);
  };
}

export type FakeStyle = 'github' | 'linear' | 'generic';

export type Fault =
  | {
      readonly kind: 'status';
      readonly status: number;
      readonly retryAfterS?: number;
    }
  | { readonly kind: 'secondary'; readonly retryAfterS?: number }
  | { readonly kind: 'network' }
  | { readonly kind: 'graphql-rate-limited' };

export interface FakeRequest {
  readonly method: string;
  readonly url: URL;
  readonly body: string | undefined;
  readonly headers: Headers;
}

export interface FakeReply {
  readonly status?: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface FakeProviderOptions {
  readonly style: FakeStyle;
  readonly clock: FakeClock;
  readonly limits?: Readonly<Record<string, number>>;
  readonly windowMs?: number;
  readonly complexityPerCall?: number;
  readonly handler?: (request: FakeRequest) => FakeReply;
}

interface Window {
  limit: number;
  remaining: number;
  resetAt: number;
}

const DEFAULT_LIMITS: Record<FakeStyle, Record<string, number>> = {
  github: { core: 5000, graphql: 5000, search: 30 },
  linear: { requests: 5000, complexity: 3_000_000 },
  generic: { requests: 100 },
};

export function createFakeProvider(options: FakeProviderOptions) {
  const { style, clock } = options;
  const windowMs = options.windowMs ?? 3_600_000;
  const limits = options.limits ?? DEFAULT_LIMITS[style];
  const windows = new Map<string, Window>();
  const faults: Fault[] = [];
  const calls: { method: string; path: string; status: number }[] = [];

  const window = (resource: string): Window => {
    let w = windows.get(resource);
    if (!w) {
      w = {
        limit: limits[resource] ?? 1000,
        remaining: limits[resource] ?? 1000,
        resetAt: clock.now + windowMs,
      };
      windows.set(resource, w);
    }
    while (clock.now >= w.resetAt) {
      w.remaining = w.limit;
      w.resetAt += windowMs;
    }
    return w;
  };

  const resourceOf = (url: URL) => {
    if (style === 'github') {
      if (url.pathname === '/graphql') return 'graphql';
      if (url.pathname.startsWith('/search/')) return 'search';
      return 'core';
    }
    return 'requests';
  };

  const budgetHeaders = (resource: string): Record<string, string> => {
    if (style === 'github') {
      const w = window(resource);
      return {
        'x-ratelimit-limit': String(w.limit),
        'x-ratelimit-remaining': String(w.remaining),
        'x-ratelimit-reset': String(Math.floor(w.resetAt / 1000)),
        'x-ratelimit-used': String(w.limit - w.remaining),
        'x-ratelimit-resource': resource,
      };
    }
    if (style === 'linear') {
      const r = window('requests');
      const c = window('complexity');
      return {
        'x-ratelimit-requests-limit': String(r.limit),
        'x-ratelimit-requests-remaining': String(r.remaining),
        'x-ratelimit-requests-reset': String(r.resetAt),
        'x-ratelimit-complexity-limit': String(c.limit),
        'x-ratelimit-complexity-remaining': String(c.remaining),
        'x-ratelimit-complexity-reset': String(c.resetAt),
        'x-complexity': String(options.complexityPerCall ?? 10),
      };
    }
    const w = window(resource);
    return {
      'x-ratelimit-limit': String(w.limit),
      'x-ratelimit-remaining': String(w.remaining),
      'x-ratelimit-reset': String(Math.floor(w.resetAt / 1000)),
    };
  };

  const json = (
    status: number,
    body: unknown,
    headers: Record<string, string>
  ) =>
    new Response(status === 304 ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });

  const fetchImpl = async (
    input: string | URL | Request,
    init: RequestInit = {}
  ): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' || input instanceof URL ? input : input.url
    );
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    const body = typeof init.body === 'string' ? init.body : undefined;
    const resource = resourceOf(url);
    const record = (status: number) =>
      calls.push({ method, path: url.pathname, status });
    const fault = faults.shift();
    if (fault?.kind === 'network') {
      record(0);
      throw new TypeError('fetch failed');
    }
    if (fault?.kind === 'secondary') {
      record(403);
      return json(
        403,
        { message: 'You have exceeded a secondary rate limit.' },
        {
          ...budgetHeaders(resource),
          'retry-after': String(fault.retryAfterS ?? 60),
        }
      );
    }
    if (fault?.kind === 'status') {
      record(fault.status);
      const extra: Record<string, string> =
        fault.retryAfterS === undefined
          ? {}
          : { 'retry-after': String(fault.retryAfterS) };
      return json(
        fault.status,
        { message: `fault ${fault.status}` },
        { ...budgetHeaders(resource), ...extra }
      );
    }
    const w = window(resource);
    if (w.remaining <= 0 || fault?.kind === 'graphql-rate-limited') {
      if (style === 'github') {
        record(403);
        return json(
          403,
          { message: 'API rate limit exceeded for installation ID 1.' },
          budgetHeaders(resource)
        );
      }
      if (style === 'linear') {
        record(400);
        return json(
          400,
          {
            errors: [
              {
                message: 'Rate limit exceeded',
                extensions: { code: 'RATELIMITED' },
              },
            ],
          },
          budgetHeaders(resource)
        );
      }
      record(429);
      return json(
        429,
        { message: 'Too Many Requests' },
        budgetHeaders(resource)
      );
    }
    const reply = options.handler?.({ method, url, body, headers }) ?? {
      body: { ok: true, path: url.pathname },
    };
    const text = JSON.stringify(reply.body ?? null);
    const etag = `"${createHash('sha1').update(text).digest('hex')}"`;
    if (method === 'GET' && headers.get('if-none-match') === etag) {
      record(304);
      return json(304, null, { ...budgetHeaders(resource), etag });
    }
    w.remaining -= 1;
    if (style === 'linear')
      window('complexity').remaining -= options.complexityPerCall ?? 10;
    const status = reply.status ?? 200;
    record(status);
    return json(status, reply.body ?? null, {
      ...budgetHeaders(resource),
      etag,
      ...reply.headers,
    });
  };

  return {
    fetch: fetchImpl as typeof fetch,
    calls,
    fault(...next: Fault[]) {
      faults.push(...next);
    },
    budget: (resource: string) => ({ ...window(resource) }),
    setRemaining(resource: string, remaining: number) {
      window(resource).remaining = remaining;
    },
  };
}
