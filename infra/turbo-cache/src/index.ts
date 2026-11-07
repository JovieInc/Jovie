// Turborepo remote cache (Remote Cache API v8) on Cloudflare Workers + R2.
//
// Roles (two scoped bearer tokens, both Worker secrets):
//   TURBO_CACHE_RW_TOKEN  main pushes and manual dispatch: read + write
//   TURBO_CACHE_RO_TOKEN  pull_request and merge_group: read only
// A read-only token can never write, so PR-controlled code cannot poison the
// cache that main trusts.

export interface R2ObjectLike {
  readonly size: number;
  readonly customMetadata?: Record<string, string>;
  readonly body?: ReadableStream;
}

export interface R2BucketLike {
  get(key: string): Promise<R2ObjectLike | null>;
  head(key: string): Promise<R2ObjectLike | null>;
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | string,
    options?: { customMetadata?: Record<string, string> }
  ): Promise<unknown>;
}

export interface Env {
  readonly CACHE: R2BucketLike;
  readonly TURBO_CACHE_RW_TOKEN?: string;
  readonly TURBO_CACHE_RO_TOKEN?: string;
  readonly MAX_ARTIFACT_BYTES?: string;
  readonly METRICS?: {
    writeDataPoint(point: {
      blobs?: string[];
      doubles?: number[];
      indexes?: string[];
    }): void;
  };
}

type Role = 'rw' | 'ro';

const HASH_RE = /^[a-f0-9]{8,128}$/;
const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function digest(value: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

// Compares SHA-256 digests so length and content leaks are not observable.
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function authenticate(
  request: Request,
  env: Env
): Promise<Role | null> {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return null;
  const presented = match[1];
  // Evaluate both so timing does not reveal which role matched.
  const rw = env.TURBO_CACHE_RW_TOKEN
    ? await safeEqual(presented, env.TURBO_CACHE_RW_TOKEN)
    : false;
  const ro = env.TURBO_CACHE_RO_TOKEN
    ? await safeEqual(presented, env.TURBO_CACHE_RO_TOKEN)
    : false;
  if (rw) return 'rw';
  if (ro) return 'ro';
  return null;
}

function record(env: Env, op: string, role: Role, result: string, size = 0) {
  // Analytics Engine: blobs = op, role, result; doubles = bytes.
  try {
    env.METRICS?.writeDataPoint({
      blobs: [op, role, result],
      doubles: [size],
      indexes: [op],
    });
  } catch {
    // Metrics must never fail a cache request.
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');

    if (path === '' || path === '/health') {
      return json({ ok: true });
    }
    if (!path.startsWith('/v8/artifacts')) {
      return json({ error: 'not_found' }, 404);
    }

    const role = await authenticate(request, env);
    if (!role) return json({ error: 'unauthorized' }, 401);

    if (path === '/v8/artifacts/status' && request.method === 'GET') {
      return json({ status: 'enabled' });
    }

    if (path === '/v8/artifacts/events' && request.method === 'POST') {
      // Turbo posts per-task HIT/MISS events. Count them; never store bodies.
      try {
        const events = (await request.json()) as Array<{
          event?: string;
          source?: string;
        }>;
        for (const e of Array.isArray(events) ? events.slice(0, 500) : []) {
          record(env, 'event', role, `${e.source ?? '?'}:${e.event ?? '?'}`);
        }
      } catch {
        // Ignore malformed event batches.
      }
      return json({});
    }

    if (path === '/v8/artifacts' && request.method === 'POST') {
      let hashes: unknown;
      try {
        hashes = ((await request.json()) as { hashes?: unknown }).hashes;
      } catch {
        return json({ error: 'bad_request' }, 400);
      }
      if (!Array.isArray(hashes)) return json({ error: 'bad_request' }, 400);
      const out: Record<string, unknown> = {};
      for (const hash of hashes.slice(0, 1000)) {
        if (typeof hash !== 'string' || !HASH_RE.test(hash)) continue;
        const head = await env.CACHE.head(`artifacts/${hash}`);
        out[hash] = head
          ? {
              size: head.size,
              taskDurationMs: Number(head.customMetadata?.duration ?? 0),
              tag: head.customMetadata?.tag,
            }
          : null;
      }
      return json(out);
    }

    const m = /^\/v8\/artifacts\/([^/]+)$/.exec(path);
    if (!m || !HASH_RE.test(m[1])) return json({ error: 'not_found' }, 404);
    const key = `artifacts/${m[1]}`;

    if (request.method === 'GET' || request.method === 'HEAD') {
      const obj =
        request.method === 'GET'
          ? await env.CACHE.get(key)
          : await env.CACHE.head(key);
      if (!obj) {
        record(env, 'get', role, 'miss');
        return new Response(null, { status: 404 });
      }
      record(env, 'get', role, 'hit', obj.size);
      const headers = new Headers({
        'content-type': 'application/octet-stream',
        'content-length': String(obj.size),
      });
      const tag = obj.customMetadata?.tag;
      if (tag) headers.set('x-artifact-tag', tag);
      return new Response(request.method === 'GET' ? obj.body : null, {
        status: 200,
        headers,
      });
    }

    if (request.method === 'PUT') {
      if (role !== 'rw') {
        record(env, 'put', role, 'forbidden');
        return json({ error: 'forbidden' }, 403);
      }
      const length = Number(request.headers.get('content-length'));
      if (!Number.isFinite(length) || length <= 0 || !request.body) {
        return json({ error: 'length_required' }, 411);
      }
      const max = Number(env.MAX_ARTIFACT_BYTES ?? DEFAULT_MAX_BYTES);
      if (length > max) return json({ error: 'too_large' }, 413);
      await env.CACHE.put(key, request.body, {
        customMetadata: {
          duration: request.headers.get('x-artifact-duration') ?? '0',
          tag: request.headers.get('x-artifact-tag') ?? '',
        },
      });
      record(env, 'put', role, 'ok', length);
      return json({ urls: [`${url.origin}${path}`] }, 202);
    }

    return json({ error: 'method_not_allowed' }, 405);
  },
};
