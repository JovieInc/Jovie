import assert from 'node:assert/strict';
import test from 'node:test';
import sources from '../sources.json' with { type: 'json' };
import {
  buildTriagePrompt,
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
    assert.match(s.url, /^https:\/\//);
    if (s.kind === 'html-links') assert.ok(s.hrefPattern);
  }
});
