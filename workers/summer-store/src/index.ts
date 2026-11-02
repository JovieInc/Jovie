/**
 * Summer shadow store on D1. HTTP surface mirrors the six Vercel Blob operations Summer used
 * (get/head, put with create-only | If-Match | overwrite, delete, prefix list) so the client in
 * apps/summer/agent/lib/summer-store-client.ts keeps the same semantics. One list call can return
 * bodies inline, which replaces Blob's list + N gets.
 */
export interface StoreObject {
  pathname: string;
  body: string;
  etag: string;
  uploadedAt: string;
}
export interface StoreBackend {
  get(pathname: string): Promise<StoreObject | null>;
  create(pathname: string, body: string): Promise<StoreObject | null>;
  match(
    pathname: string,
    body: string,
    etag: string
  ): Promise<StoreObject | null>;
  overwrite(pathname: string, body: string): Promise<StoreObject>;
  del(pathname: string): Promise<void>;
  list(
    prefix: string,
    after: string | null,
    limit: number
  ): Promise<StoreObject[]>;
}
type Env = { DB?: D1Like; STORE_TOKEN?: string; MAX_BODY_BYTES?: string };
interface D1Like {
  prepare(sql: string): {
    bind(...v: unknown[]): {
      run(): Promise<{ meta: { changes: number } }>;
      all<T>(): Promise<{ results: T[] }>;
      first<T>(): Promise<T | null>;
    };
  };
}

const MAX_LIST = 1000;
const enc = new TextEncoder();
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });

async function etagFor(body: string, version: number): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    enc.encode(`${version}:${body}`)
  );
  const hex = [...new Uint8Array(digest)]
    .slice(0, 12)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `"v${version}-${hex}"`;
}
function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a),
    y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++)
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

type Row = {
  pathname: string;
  body: string;
  etag: string;
  uploaded_at: string;
  version: number;
};
const toObject = (r: Row): StoreObject => ({
  pathname: r.pathname,
  body: r.body,
  etag: r.etag,
  uploadedAt: r.uploaded_at,
});

export function d1Backend(
  db: D1Like,
  now: () => Date = () => new Date()
): StoreBackend {
  const sel = 'SELECT pathname, body, etag, uploaded_at, version FROM objects';
  const read = async (p: string) =>
    await db.prepare(`${sel} WHERE pathname = ?1`).bind(p).first<Row>();
  return {
    async get(p) {
      const r = await read(p);
      return r ? toObject(r) : null;
    },
    async create(p, body) {
      const etag = await etagFor(body, 1),
        at = now().toISOString();
      const res = await db
        .prepare(
          'INSERT INTO objects (pathname, body, etag, uploaded_at, version) VALUES (?1, ?2, ?3, ?4, 1) ON CONFLICT(pathname) DO NOTHING'
        )
        .bind(p, body, etag, at)
        .run();
      return res.meta.changes === 1
        ? { pathname: p, body, etag, uploadedAt: at }
        : null;
    },
    async match(p, body, expected) {
      const cur = await read(p);
      if (!cur || cur.etag !== expected) return null;
      const version = cur.version + 1,
        etag = await etagFor(body, version),
        at = now().toISOString();
      // The etag predicate makes the compare-and-set atomic even if another writer slipped in.
      const res = await db
        .prepare(
          'UPDATE objects SET body = ?1, etag = ?2, uploaded_at = ?3, version = ?4 WHERE pathname = ?5 AND etag = ?6'
        )
        .bind(body, etag, at, version, p, expected)
        .run();
      return res.meta.changes === 1
        ? { pathname: p, body, etag, uploadedAt: at }
        : null;
    },
    async overwrite(p, body) {
      const cur = await read(p);
      const version = (cur?.version ?? 0) + 1,
        etag = await etagFor(body, version),
        at = now().toISOString();
      await db
        .prepare(
          'INSERT INTO objects (pathname, body, etag, uploaded_at, version) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(pathname) DO UPDATE SET body = excluded.body, etag = excluded.etag, uploaded_at = excluded.uploaded_at, version = objects.version + 1'
        )
        .bind(p, body, etag, at, version)
        .run();
      return { pathname: p, body, etag, uploadedAt: at };
    },
    async del(p) {
      await db.prepare('DELETE FROM objects WHERE pathname = ?1').bind(p).run();
    },
    async list(prefix, after, limit) {
      // A cursor inside the prefix range is exclusive, even when it equals the
      // prefix itself (an object stored at exactly `prefix`).
      const useCursor = after != null && after >= prefix;
      const lo = useCursor ? after : prefix;
      const op = useCursor ? '>' : '>=';
      const { results } = await db
        .prepare(
          `${sel} WHERE pathname ${op} ?1 AND pathname < ?2 ORDER BY pathname LIMIT ?3`
        )
        .bind(lo, `${prefix}\u{10FFFF}`, limit)
        .all<Row>();
      return results.map(toObject);
    },
  };
}

export async function handle(
  request: Request,
  backend: StoreBackend,
  token: string | undefined,
  maxBody = 1_500_000
): Promise<Response> {
  const auth = request.headers.get('authorization') ?? '';
  if (!token || !auth.startsWith('Bearer ') || !safeEqual(auth.slice(7), token))
    return json(401, { error: 'unauthorized' });
  const url = new URL(request.url);
  const path = url.searchParams.get('path') ?? '';
  if (url.pathname === '/v1/object') {
    if (!path || path.length > 1024)
      return json(400, { error: 'path-invalid' });
    if (request.method === 'GET') {
      const o = await backend.get(path);
      return o ? json(200, o) : json(404, { error: 'not-found' });
    }
    if (request.method === 'DELETE') {
      await backend.del(path);
      return json(200, { ok: true });
    }
    if (request.method === 'PUT') {
      const body = await request.text();
      if (enc.encode(body).length > maxBody)
        return json(413, { error: 'oversized' });
      const mode = url.searchParams.get('mode') ?? 'create';
      if (mode === 'overwrite')
        return json(200, await backend.overwrite(path, body));
      if (mode === 'create') {
        const o = await backend.create(path, body);
        return o ? json(200, o) : json(409, { error: 'exists' });
      }
      if (mode === 'match') {
        const ifMatch = url.searchParams.get('ifMatch') ?? '';
        if (!ifMatch) return json(400, { error: 'ifMatch-required' });
        const o = await backend.match(path, body, ifMatch);
        return o ? json(200, o) : json(412, { error: 'precondition-failed' });
      }
      return json(400, { error: 'mode-invalid' });
    }
  }
  if (url.pathname === '/v1/list' && request.method === 'GET') {
    const prefix = url.searchParams.get('prefix') ?? '';
    const cursor = url.searchParams.get('cursor');
    const limit = Math.min(
      MAX_LIST,
      Math.max(1, Number(url.searchParams.get('limit') ?? 100) || 100)
    );
    const bodies = url.searchParams.get('bodies') === '1';
    const rows = await backend.list(prefix, cursor, limit + 1);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return json(200, {
      blobs: page.map(o => ({
        pathname: o.pathname,
        uploadedAt: o.uploadedAt,
        etag: o.etag,
        ...(bodies ? { body: o.body } : {}),
      })),
      hasMore,
      ...(hasMore ? { cursor: page[page.length - 1].pathname } : {}),
    });
  }
  return json(404, { error: 'not-found' });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.DB) return json(503, { error: 'store-unavailable' });
    return handle(
      request,
      d1Backend(env.DB),
      env.STORE_TOKEN,
      Number(env.MAX_BODY_BYTES) || undefined
    );
  },
};
