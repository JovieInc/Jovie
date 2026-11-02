import sources from '../sources.json' with { type: 'json' };
import {
  buildTriagePrompt,
  itemId,
  type ParsedItem,
  pageFingerprint,
  parseFeed,
  parseHtmlLinks,
  parseTriage,
  sha256Hex,
} from './parse.ts';

export interface Env {
  DB: D1Database;
  AI: Ai;
  READ_TOKEN?: string;
}

interface SourceStateRow {
  etag: string | null;
  last_modified: string | null;
  content_hash: string | null;
  items_total: number;
}

type Source = (typeof sources.sources)[number] & {
  hrefPattern?: string;
  excludePattern?: string;
  idBy?: string;
  userAgent?: string;
  enabled?: boolean;
};

const UA = 'jovie-competitor-watch/1.0 (+https://jov.ie)';
const MAX_BYTES = 600_000; // newest entries come first; feeds can be 8MB
const FIRST_RUN_CAP = 15;
const TRIAGE_PER_RUN = 60;
const TRIAGE_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const MAX_AGE_DAYS = 45;

function activeSources(): Source[] {
  return (sources.sources as Source[]).filter(s => s.enabled !== false);
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let out = '';
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    n += value.length;
    out += dec.decode(value, { stream: true });
    if (n >= MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return out;
}

export async function pollSource(
  env: Env,
  src: Source,
  now = new Date()
): Promise<{ source: string; status: number; added: number; error?: string }> {
  const state = await env.DB.prepare(
    'SELECT * FROM source_state WHERE source = ?'
  )
    .bind(src.id)
    .first<SourceStateRow>();
  const headers: Record<string, string> = {
    'user-agent': src.userAgent ?? UA,
    accept:
      'application/rss+xml, application/atom+xml, text/html;q=0.8, */*;q=0.5',
  };
  if (state?.etag) headers['if-none-match'] = state.etag;
  if (state?.last_modified) headers['if-modified-since'] = state.last_modified;
  const iso = now.toISOString();
  let status = 0;
  try {
    const res = await fetch(src.url, { headers, redirect: 'follow' });
    status = res.status;
    if (res.status === 304) {
      await upsertState(
        env,
        src.id,
        { last_checked_at: iso, last_status: 304, last_error: null },
        state
      );
      return { source: src.id, status, added: 0 };
    }
    if (!res.ok) throw new Error(`http ${res.status}`);
    const body = await readCapped(res);
    let items: ParsedItem[] = [];
    let contentHash: string | null = null;
    if (src.kind === 'feed') items = parseFeed(body);
    else if (src.kind === 'html-links')
      items = parseHtmlLinks(
        body,
        src.url,
        src.hrefPattern ?? '^/',
        30,
        src.excludePattern
      );
    else {
      contentHash = await pageFingerprint(body);
      if (contentHash !== state?.content_hash && state?.content_hash) {
        items = [
          {
            title: `${src.name} updated`,
            url: src.url,
            publishedAt: null,
            excerpt: '',
            idSeed: contentHash,
          },
        ];
      }
    }
    if (!state) items = items.slice(0, FIRST_RUN_CAP);
    let added = 0;
    for (const it of items) {
      const seed =
        it.idSeed ??
        (src.idBy === 'url+title' ? `${it.url}|${it.title}` : null);
      const id = seed
        ? (await sha256Hex(`${src.id}|${seed}`)).slice(0, 24)
        : await itemId(src.id, it.url);
      const r = await env.DB.prepare(
        'INSERT OR IGNORE INTO items (id, source, title, url, published_at, first_seen_at, excerpt) VALUES (?,?,?,?,?,?,?)'
      )
        .bind(id, src.id, it.title, it.url, it.publishedAt, iso, it.excerpt)
        .run();
      if (r.meta.changes) added++;
    }
    await upsertState(
      env,
      src.id,
      {
        etag: res.headers.get('etag'),
        last_modified: res.headers.get('last-modified'),
        content_hash: contentHash ?? state?.content_hash ?? null,
        last_checked_at: iso,
        last_status: status,
        last_error: null,
        items_total: (state?.items_total ?? 0) + added,
      },
      state
    );
    return { source: src.id, status, added };
  } catch (e) {
    const error = String((e as Error).message ?? e).slice(0, 200);
    await upsertState(
      env,
      src.id,
      { last_checked_at: iso, last_status: status, last_error: error },
      state
    );
    return { source: src.id, status, added: 0, error };
  }
}

async function upsertState(
  env: Env,
  source: string,
  patch: Record<string, unknown>,
  prev: SourceStateRow | null
) {
  const row: Record<string, unknown> = {
    source,
    etag: prev?.etag ?? null,
    last_modified: prev?.last_modified ?? null,
    content_hash: prev?.content_hash ?? null,
    items_total: prev?.items_total ?? 0,
    ...patch,
  };
  await env.DB.prepare(
    `INSERT INTO source_state (source, etag, last_modified, content_hash, last_checked_at, last_status, last_error, items_total)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(source) DO UPDATE SET etag=excluded.etag, last_modified=excluded.last_modified, content_hash=excluded.content_hash,
       last_checked_at=excluded.last_checked_at, last_status=excluded.last_status, last_error=excluded.last_error, items_total=excluded.items_total`
  )
    .bind(
      row.source,
      row.etag,
      row.last_modified,
      row.content_hash,
      row.last_checked_at ?? null,
      row.last_status ?? null,
      row.last_error ?? null,
      row.items_total
    )
    .run();
}

export async function triagePending(
  env: Env,
  now = new Date()
): Promise<number> {
  const cutoff = new Date(now.getTime() - MAX_AGE_DAYS * 864e5).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT id, source, title, excerpt FROM items WHERE triaged_at IS NULL
       AND COALESCE(published_at, first_seen_at) >= ? ORDER BY COALESCE(published_at, first_seen_at) DESC LIMIT ?`
  )
    .bind(cutoff, TRIAGE_PER_RUN)
    .all<{
      id: string;
      source: string;
      title: string;
      excerpt: string | null;
    }>();
  let done = 0;
  for (const row of results) {
    try {
      const prompt = buildTriagePrompt(
        {
          source: row.source,
          title: row.title,
          excerpt: row.excerpt ?? '',
        },
        sources.context
      );
      const out = (await env.AI.run(TRIAGE_MODEL, {
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
      })) as { response?: unknown } | null;
      const t = parseTriage(out?.response ?? out);
      if (!t) continue;
      await env.DB.prepare(
        `UPDATE items SET summary=?, relevance=?, surfaces=?, kind=?, adoptable_now=?, cost_saving=?, why=?, triaged_at=?, excerpt=NULL WHERE id=?`
      )
        .bind(
          t.summary,
          t.relevance,
          JSON.stringify(t.surfaces),
          t.kind,
          t.adoptableNow ? 1 : 0,
          t.costSaving ? 1 : 0,
          t.why,
          now.toISOString(),
          row.id
        )
        .run();
      done++;
    } catch {
      // leave untriaged; next hourly run retries
    }
  }
  return done;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

function authed(req: Request, env: Env): boolean {
  return (
    !!env.READ_TOKEN &&
    req.headers.get('authorization') === `Bearer ${env.READ_TOKEN}`
  );
}

export default {
  async scheduled(_evt: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        for (const src of activeSources()) await pollSource(env, src);
        await triagePending(env);
      })()
    );
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') return json({ ok: true });
    if (!authed(req, env)) return json({ error: 'unauthorized' }, 401);

    if (url.pathname === '/run' && req.method === 'POST') {
      const polled = [];
      for (const src of activeSources())
        polled.push(await pollSource(env, src));
      const triaged = await triagePending(env);
      return json({ polled, triaged });
    }
    if (url.pathname === '/sources') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM source_state ORDER BY source'
      ).all();
      return json({ sources: results });
    }
    if (url.pathname === '/items') {
      const min = Number(url.searchParams.get('min_relevance') ?? 0);
      const status = url.searchParams.get('route_status');
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
      const { results } = await env.DB.prepare(
        `SELECT * FROM items WHERE COALESCE(relevance,0) >= ? AND (? IS NULL OR route_status = ?)
         ORDER BY COALESCE(published_at, first_seen_at) DESC LIMIT ?`
      )
        .bind(min, status, status, limit)
        .all();
      return json({ items: results });
    }
    const routed = url.pathname.match(/^\/items\/([a-f0-9]+)\/routed$/);
    if (routed && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as { to?: string };
      await env.DB.prepare(
        `UPDATE items SET route_status='routed', routed_to=?, routed_at=? WHERE id=?`
      )
        .bind(
          String(body.to ?? 'unknown').slice(0, 80),
          new Date().toISOString(),
          routed[1]
        )
        .run();
      return json({ ok: true });
    }
    if (url.pathname === '/metrics') {
      const { results } = await env.DB.prepare(
        `SELECT source, COUNT(*) n, SUM(triaged_at IS NOT NULL) triaged, SUM(COALESCE(relevance,0)>=4) relevant,
                MAX(first_seen_at) last_seen FROM items GROUP BY source`
      ).all();
      return json({ perSource: results });
    }
    return json({ error: 'not found' }, 404);
  },
};
