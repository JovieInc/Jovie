import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import sources from '../sources.json' with { type: 'json' };
import { pollSource, triagePending } from './index.ts' with {
  type: 'javascript',
};
import {
  buildTriagePrompt,
  decodeEntities,
  itemId,
  parseFeed,
  parseHtmlLinks,
  parseTriage,
} from './parse.ts' with { type: 'javascript' };

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Workers AI &amp; Gateway]]></title><link>https://blog.example.com/a?utm_source=x</link>
<pubDate>Tue, 28 Oct 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;&lt;/p&gt;</description></item>
<item><title>Truncated</title><link>https://blog.example.com/b</link>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>New dashboard</title>
<link rel="alternate" href="https://vercel.example/c"/><updated>2026-10-27T01:02:03Z</updated>
<summary>Short</summary></entry></feed>`;

function database(
  t,
  schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schema);
  t.after(() => sqlite.close());
  return {
    sqlite,
    prepare(sql) {
      let values = [];
      return {
        bind(...args) {
          values = args;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...values) ?? null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...values) };
        },
        async run() {
          return {
            meta: { changes: sqlite.prepare(sql).run(...values).changes },
          };
        },
      };
    },
  };
}

test('parseFeed handles RSS, CDATA, entities and drops a truncated tail', () => {
  const items = parseFeed(RSS);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Workers AI & Gateway');
  assert.equal(items[0].publishedAt, '2026-10-28T10:00:00.000Z');
  assert.equal(items[0].excerpt, 'Hello world');
});

test('parseFeed handles Atom alternate links', () => {
  const [it] = parseFeed(ATOM);
  assert.equal(it.url, 'https://vercel.example/c');
  assert.equal(it.publishedAt, '2026-10-27T01:02:03.000Z');
});

test('numeric entities reject invalid Unicode and preserve valid characters', () => {
  assert.equal(
    decodeEntities('&#0; &#xD800; &#1114112;'),
    '\uFFFD \uFFFD \uFFFD'
  );
  assert.equal(decodeEntities('&#65; &#x1F600;'), 'A 😀');
});

test('pollSource keeps valid entries after malformed URLs and numeric entities', async t => {
  const DB = database(t);
  const feed = `<rss><channel>
    <item><title>Bad URL</title><link>https://[</link></item>
    <item><title>Relative &#x110000; &#999999999999999999999999;</title><link>/relative</link></item>
    <item><title>Unsafe</title><link>javascript:alert(1)</link></item>
    <item><title>Valid</title><link>https://vendor.example/valid</link></item>
    </channel></rss>`;
  t.mock.method(globalThis, 'fetch', async () => new Response(feed));
  const result = await pollSource(
    { DB },
    {
      id: 'fixture',
      kind: 'feed',
      name: 'Fixture',
      url: 'https://vendor.example/feed',
    },
    new Date('2026-11-17T00:00:00Z')
  );
  assert.equal(result.error, undefined);
  assert.equal(result.added, 2);
  const rows = DB.sqlite
    .prepare('SELECT title, url FROM items ORDER BY url')
    .all();
  assert.deepEqual(
    rows.map(row => row.url),
    ['https://vendor.example/relative', 'https://vendor.example/valid']
  );
  assert.equal(rows[0].title, 'Relative \uFFFD \uFFFD');
});

test('expired excerpts are cleared without sending old items to triage', async t => {
  const DB = database(t);
  const now = new Date('2026-11-17T00:00:00Z');
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(`<rss><channel>
    <item><title>Old</title><link>https://vendor.example/old</link><pubDate>2026-01-01</pubDate><description>Old source text</description></item>
    <item><title>Recent</title><link>https://vendor.example/recent</link><pubDate>2026-11-16</pubDate><description>Pending input</description></item>
    </channel></rss>`)
  );
  await pollSource(
    { DB },
    {
      id: 'fixture',
      kind: 'feed',
      name: 'Fixture',
      url: 'https://vendor.example/feed',
    },
    now
  );
  const rows = DB.sqlite
    .prepare('SELECT title, excerpt FROM items ORDER BY title')
    .all();
  assert.equal(rows[0].excerpt, null);
  assert.equal(rows[1].excerpt, 'Pending input');
  DB.sqlite
    .prepare('UPDATE items SET excerpt=? WHERE title=?')
    .run('Legacy expired input', 'Old');
  let calls = 0;
  const triaged = await triagePending(
    {
      DB,
      AI: {
        async run() {
          calls++;
          throw new Error('expired item reached model');
        },
      },
    },
    new Date('2027-01-01T00:00:00Z')
  );
  assert.equal(triaged, 0);
  assert.equal(calls, 0);
  assert.equal(
    DB.sqlite
      .prepare('SELECT COUNT(*) AS n FROM items WHERE excerpt IS NOT NULL')
      .get().n,
    0
  );
});

test('triage preserves eligible retry inputs through the exact cutoff', async t => {
  const DB = database(t);
  const now = new Date('2026-11-17T00:00:00Z');
  const cutoff = new Date(now.getTime() - 45 * 864e5).toISOString();
  DB.sqlite
    .prepare(
      'INSERT INTO items (id,source,title,url,first_seen_at,published_at,excerpt) VALUES (?,?,?,?,?,?,?)'
    )
    .run(
      'pending',
      'fixture',
      'Retry',
      'https://vendor.example/retry',
      cutoff,
      cutoff,
      'Retained input'
    );
  const prompts = [];
  const env = {
    DB,
    AI: {
      async run(_model, payload) {
        prompts.push(payload.messages[0].content);
        if (prompts.length === 1) throw new Error('fixture transport failure');
        return {
          response: JSON.stringify({ summary: 'Own summary', relevance: 4 }),
        };
      },
    },
  };
  assert.equal(await triagePending(env, now), 0);
  assert.equal(
    DB.sqlite.prepare('SELECT excerpt FROM items WHERE id=?').get('pending')
      .excerpt,
    'Retained input'
  );
  assert.equal(await triagePending(env, now), 1);
  assert.ok(prompts.every(prompt => prompt.includes('Retained input')));
  const row = DB.sqlite
    .prepare('SELECT excerpt, summary, triaged_at FROM items WHERE id=?')
    .get('pending');
  assert.equal(row.excerpt, null);
  assert.equal(row.summary, 'Own summary');
  assert.equal(row.triaged_at, now.toISOString());
});

test('legacy excerpt migration preserves items and supports polling', async t => {
  const schema = readFileSync(
    new URL('../schema.sql', import.meta.url),
    'utf8'
  );
  const legacy = schema.replace(/,\n  excerpt TEXT[^\n]*/, '');
  const DB = database(t, legacy);
  DB.sqlite
    .prepare(
      'INSERT INTO items (id,source,title,url,first_seen_at) VALUES (?,?,?,?,?)'
    )
    .run(
      'old',
      'fixture',
      'Existing',
      'https://vendor.example/existing',
      '2026-11-16T00:00:00Z'
    );
  assert.equal(
    DB.sqlite
      .prepare('PRAGMA table_info(items)')
      .all()
      .some(row => row.name === 'excerpt'),
    false
  );
  DB.sqlite.exec(schema);
  assert.throws(
    () => DB.sqlite.prepare('SELECT excerpt FROM items').all(),
    /no such column/
  );
  DB.sqlite.exec(
    readFileSync(
      new URL(
        '../legacy-migrations/0001_add_item_excerpt.sql',
        import.meta.url
      ),
      'utf8'
    )
  );
  assert.equal(
    DB.sqlite
      .prepare('PRAGMA table_info(items)')
      .all()
      .some(row => row.name === 'excerpt'),
    true
  );
  assert.equal(
    DB.sqlite.prepare('SELECT title FROM items WHERE id=?').get('old').title,
    'Existing'
  );
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        '<rss><channel><item><title>New</title><link>https://vendor.example/new</link></item></channel></rss>'
      )
  );
  const result = await pollSource(
    { DB },
    {
      id: 'fixture',
      kind: 'feed',
      name: 'Fixture',
      url: 'https://vendor.example/feed',
    },
    new Date('2026-11-17T00:00:00Z')
  );
  assert.equal(result.error, undefined);
  assert.equal(result.added, 1);
});

test('parseHtmlLinks picks matching same-origin links once', () => {
  const html = `<a href="/news/one">One <span>post</span></a><a href="/news/one">dup</a>
  <a href="/careers">no</a><a href="https://evil.test/news/x">no</a><a href="/news/two"></a>`;
  const items = parseHtmlLinks(
    html,
    'https://www.example.com/news',
    '^/news/[a-z0-9-]+$'
  );
  assert.deepEqual(
    items.map(i => i.url),
    ['https://www.example.com/news/one', 'https://www.example.com/news/two']
  );
  assert.equal(items[0].title, 'one');
  assert.equal(items[0].excerpt, 'One post');
  assert.equal(
    parseHtmlLinks(html, 'https://www.example.com/news', '^/news/', 30, '/two$')
      .length,
    1
  );
});

test('itemId ignores tracking params and fragments, differs by source', async () => {
  const a = await itemId('s', 'https://x.test/p?utm_source=a#frag');
  assert.equal(a, await itemId('s', 'https://x.test/p'));
  assert.notEqual(a, await itemId('t', 'https://x.test/p'));
});

test('parseTriage clamps, filters surfaces, tolerates prose around JSON', () => {
  const t = parseTriage(
    'Sure! {"summary":"s","relevance":9,"surfaces":["chat","bogus"],"kind":"model","adoptable_now":true,"cost_saving":false,"why":"w"}'
  );
  assert.equal(t.relevance, 5);
  assert.deepEqual(t.surfaces, ['chat']);
  assert.equal(t.adoptableNow, true);
  assert.equal(parseTriage('no json'), null);
  assert.equal(parseTriage({ relevance: 'x' }), null);
});

test('prompt carries context and never asks to copy source text', () => {
  const p = buildTriagePrompt(
    { source: 'a', title: 't', excerpt: '' },
    sources.context
  );
  assert.match(p, /do not copy source wording/);
  assert.match(p, /openResearch/);
});

test('sources config is well formed', () => {
  const ids = new Set();
  for (const s of sources.sources) {
    assert.ok(!ids.has(s.id), `duplicate ${s.id}`);
    ids.add(s.id);
    assert.ok(['feed', 'html-links', 'page-watch'].includes(s.kind));
    assert.ok(['company', 'person'].includes(s.type));
    assert.match(s.url, /^https:\/\//);
    if (s.kind === 'html-links') assert.ok(s.hrefPattern);
  }
});
