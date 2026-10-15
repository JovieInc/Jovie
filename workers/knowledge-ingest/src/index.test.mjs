import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { classifyProductLanes } from '../../../scripts/lib/product-lane-classifier.mjs';
import worker, { run } from './index.ts';
import {
  anonymize,
  discover,
  extractArticle,
  hash,
  sourcesFromSecret,
} from './source.ts';
import { requestText } from './transport.ts';

// Invented fixture identities; never load the private production registry here.
const origin = 'https://source.example.com';
const endpoint = 'https://brain.example.com/mcp';
const article = (title = 'Release planning', extra = '') => `<html><article>
  <h1>${title}</h1><time datetime="2026-10-14"></time>
  <p>Fixture Source explains how independent artists can prepare a release,
  organize recordings, plan promotion and document collaborator agreements. ${extra}</p>
  <nav>ignore navigation</nav><script>ignore script</script>
  </article><footer>ignore footer</footer></html>`;
const sitemap = urls =>
  `<urlset>${urls.map(url => `<url><loc>${url}</loc></url>`).join('')}</urlset>`;
const source = (overrides = {}) => ({
  code: 'SRC-1',
  origin,
  discoveryUrl: `${origin}/sitemap.xml`,
  discoveryKind: 'sitemap',
  pathPrefix: '/articles/',
  contentTag: 'article',
  identityTerms: ['Fixture Source'],
  approved: true,
  termsApproved: true,
  ...overrides,
});

function setup(sources = [source()]) {
  let clock = Date.parse('2026-10-15T05:17:00Z');
  const env = {
    KNOWLEDGE_SOURCES_JSON: JSON.stringify(sources),
    GBRAIN_MCP_URL: endpoint,
    GBRAIN_API_KEY: 'fixture-only-credential',
  };
  const rows = new Map();
  const shells = new Map();
  const calls = [];
  const sleeps = [];
  const pages = new Map([
    [`${origin}/robots.txt`, 'User-agent: *\nAllow: /'],
    [`${origin}/sitemap.xml`, sitemap([`${origin}/articles/one`])],
    [`${origin}/articles/one`, article()],
  ]);
  const state = { failWrite: false, wire: 'json', rpcError: null };
  const rt = {
    now: () => clock,
    async sleep(ms) {
      sleeps.push(ms);
      clock += ms;
    },
    async fetch(url, init) {
      assert.equal(init.redirect, 'manual');
      assert.ok(init.signal instanceof AbortSignal);
      if (url === endpoint) {
        assert.equal(
          init.headers.Authorization,
          'Bearer fixture-only-credential'
        );
        const { params } = JSON.parse(init.body);
        calls.push(params);
        const { name, arguments: args } = params;
        if (state.rpcError) return state.rpcError();
        let result;
        if (name === 'get_raw_data') {
          const row = rows.get(args.slug);
          result = row ? [{ source: args.source, data: row }] : [];
        } else if (name === 'put_page') {
          shells.set(args.slug, args.content);
          result = { slug: args.slug, status: 'imported', chunks: 0 };
        } else {
          assert.equal(name, 'put_raw_data');
          assert.ok(shells.has(args.slug), 'raw_data requires a parent page');
          if (state.failWrite)
            return Response.json({
              id: 1,
              result: {
                isError: true,
                content: [{ type: 'text', text: origin }],
              },
            });
          rows.set(args.slug, args.data);
          result = { status: 'ok' };
        }
        const body = {
          jsonrpc: '2.0',
          id: 1,
          result: { content: [{ type: 'text', text: JSON.stringify(result) }] },
        };
        return state.wire === 'sse'
          ? new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`)
          : Response.json(body);
      }
      calls.push({ url, at: clock });
      const body = pages.get(url);
      if (body instanceof Error) throw body;
      return body instanceof Response
        ? body.clone()
        : new Response(body ?? '', { status: body === undefined ? 404 : 200 });
    },
  };
  return {
    env,
    rows,
    shells,
    calls,
    pages,
    rt,
    sleeps,
    state,
    tick: ms => {
      clock += ms;
    },
  };
}

test('new discoveries from SRC-1..3 land only in raw_data with anonymous provenance', async () => {
  const f = setup([
    source(),
    source({ code: 'SRC-2' }),
    source({ code: 'SRC-3' }),
  ]);
  const receipts = await run(f.env, f.rt);
  assert.deepEqual(
    receipts.map(r => [r.source, r.status, r.written]),
    [
      ['SRC-1', 'ok', 1],
      ['SRC-2', 'ok', 1],
      ['SRC-3', 'ok', 1],
    ]
  );
  const documents = [...f.rows.values()].filter(row => row.contentHash);
  assert.equal(documents.length, 3);
  for (const doc of documents) {
    assert.equal(doc.canon, false);
    assert.equal(doc.trust, 'untrusted');
    assert.equal(doc.visibility, 'private-internal');
    assert.match(doc.text, /independent artists/);
    assert.equal(doc.publishedAt, '2026-10-14T00:00:00.000Z');
    assert.equal(doc.contentHash, await hash(`${doc.title}\n${doc.text}`));
  }
  const persisted = JSON.stringify([...f.rows, ...f.shells]);
  assert.doesNotMatch(
    persisted,
    /Fixture Source|source\.example|https?:|ignore navigation|ignore script|ignore footer/
  );
  for (const shell of f.shells.values()) {
    assert.equal(
      shell.split('---')[2].trim(),
      '',
      'compiled_truth body must stay empty'
    );
    assert.match(shell, /canon: false/);
  }
  assert.ok(
    f.calls
      .filter(c => c.name)
      .every(c => ['get_raw_data', 'put_page', 'put_raw_data'].includes(c.name))
  );
});

test('same content and replayed runs dedupe; changed content creates a new raw revision', async () => {
  const f = setup();
  assert.equal((await run(f.env, f.rt))[0].written, 1);
  const shells = f.shells.size;
  f.tick(86_400_000);
  assert.equal((await run(f.env, f.rt))[0].duplicate, 1);
  assert.equal(f.shells.size, shells);
  f.pages.set(`${origin}/articles/one`, article('Updated release planning'));
  assert.equal((await run(f.env, f.rt))[0].written, 1);
  assert.equal([...f.rows.values()].filter(r => r.contentHash).length, 2);
});

test('bounded backfill advances, prioritizes new URLs, then revisits old pages', async () => {
  const f = setup([source({ maxPages: 1 })]);
  f.pages.set(
    `${origin}/sitemap.xml`,
    sitemap([`${origin}/articles/one`, `${origin}/articles/two`])
  );
  f.pages.set(`${origin}/articles/two`, article('Second release'));
  assert.equal((await run(f.env, f.rt))[0].status, 'limited');
  assert.equal((await run(f.env, f.rt))[0].written, 1);
  assert.equal((await run(f.env, f.rt))[0].duplicate, 1);
  f.pages.set(
    `${origin}/sitemap.xml`,
    sitemap([
      `${origin}/articles/one`,
      `${origin}/articles/two`,
      `${origin}/articles/three`,
    ])
  );
  f.pages.set(`${origin}/articles/three`, article('Third release'));
  assert.equal((await run(f.env, f.rt))[0].written, 1);
  const fetched = f.calls
    .filter(c => c.url?.includes('/articles/'))
    .map(c => c.url);
  assert.deepEqual(
    fetched,
    ['one', 'two', 'one', 'three'].map(n => `${origin}/articles/${n}`)
  );
});

test('nested sitemaps and RSS/Atom feeds discover only same-origin scoped pages', async () => {
  const f = setup();
  f.pages.set(
    `${origin}/sitemap.xml`,
    `<sitemapindex><sitemap><loc>${origin}/nested.xml</loc></sitemap></sitemapindex>`
  );
  f.pages.set(
    `${origin}/nested.xml`,
    sitemap([
      `${origin}/articles/one`,
      'https://other.example.com/article',
      `${origin}/private/one`,
    ])
  );
  assert.equal((await run(f.env, f.rt))[0].written, 1);
  assert.equal(f.calls.filter(c => c.url).length, 4);
  for (const xml of [
    `<rss><channel><item><link>${origin}/articles/one</link></item></channel></rss>`,
    `<feed><entry><link rel="self" href="${origin}/no"/><link rel="alternate" href="${origin}/articles/one"/></entry></feed>`,
  ]) {
    const feed = setup([source({ discoveryKind: 'feed' })]);
    feed.pages.set(`${origin}/sitemap.xml`, xml);
    assert.equal((await run(feed.env, feed.rt))[0].written, 1);
  }
  assert.throws(() => discover('<html>not a sitemap</html>', 'sitemap'));
  assert.throws(() => discover('<html>not a feed</html>', 'feed'));
});

test('robots disallow and missing approval block requests and raw writes', async () => {
  for (const approval of [{ approved: false }, { termsApproved: false }]) {
    const f = setup([source(approval)]);
    assert.equal((await run(f.env, f.rt))[0].reason, 'approval_required');
    assert.equal(f.calls.length, 0);
  }
  for (const robots of [
    'User-agent: *\nDisallow: /',
    'User-agent: JovieKnowledgeBot\nDisallow: /articles/',
  ]) {
    const f = setup();
    f.pages.set(`${origin}/robots.txt`, robots);
    const [receipt] = await run(f.env, f.rt);
    assert.equal(receipt.status, 'blocked');
    assert.equal(receipt.reason, 'robots_disallowed');
    assert.equal(f.calls.filter(c => c.url?.includes('/articles/')).length, 0);
    assert.equal(f.rows.size, 0);
  }
});

test('crawl-delay throttles every upstream request and oversized delays block', async () => {
  const f = setup();
  f.pages.set(
    `${origin}/robots.txt`,
    'User-agent: *\nAllow: /\nCrawl-delay: 5'
  );
  await run(f.env, f.rt);
  const times = f.calls.filter(c => c.url).map(c => c.at);
  assert.ok(times.slice(1).every((time, index) => time - times[index] >= 5000));
  f.pages.set(`${origin}/robots.txt`, 'User-agent: *\nCrawl-delay: 61');
  assert.equal(
    (await run(f.env, f.rt))[0].reason,
    'crawl_delay_exceeds_budget'
  );
});

test('robots 404 permits crawling; denial, backoff and redirects fail closed', async () => {
  const missing = setup();
  missing.pages.delete(`${origin}/robots.txt`);
  assert.equal((await run(missing.env, missing.rt))[0].written, 1);
  for (const status of [301, 403, 429, 503]) {
    const f = setup();
    f.pages.set(`${origin}/robots.txt`, new Response(origin, { status }));
    const [receipt] = await run(f.env, f.rt);
    assert.equal(receipt.status, 'failed');
    assert.equal(f.rows.size, 0);
    assert.equal(f.calls.length, status === 503 ? 2 : 1);
  }
  const f = setup();
  f.pages.set(
    `${origin}/articles/one`,
    new Response(null, {
      status: 302,
      headers: { Location: 'https://other.example.com/' },
    })
  );
  assert.equal((await run(f.env, f.rt))[0].reason, 'http_failed');
  assert.equal(f.rows.size, 0);
});

test('write failures are failures, never successes or advanced crawl checkpoints', async () => {
  const f = setup();
  f.state.failWrite = true;
  const [receipt] = await run(f.env, f.rt);
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.reason, 'brain_failed');
  assert.equal(receipt.written, 0);
  assert.equal(f.rows.size, 0);
  f.state.failWrite = false;
  assert.equal((await run(f.env, f.rt))[0].written, 1);
});

test('empty discovery and sparse extractions fail visibly while valid siblings progress', async () => {
  const f = setup();
  f.pages.set(`${origin}/sitemap.xml`, '<urlset/>');
  assert.equal((await run(f.env, f.rt))[0].reason, 'discovery_empty');
  f.pages.set(
    `${origin}/sitemap.xml`,
    sitemap([`${origin}/articles/empty`, `${origin}/articles/one`])
  );
  f.pages.set(`${origin}/articles/empty`, '<article>too short</article>');
  const [receipt] = await run(f.env, f.rt);
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.reason, 'content_missing');
  assert.equal(receipt.written, 1);
});

test('dry-run or wrong-page persistence acknowledgements cannot claim success', async () => {
  for (const name of ['put_page', 'put_raw_data']) {
    const f = setup();
    const fetch = f.rt.fetch;
    f.rt.fetch = async (url, init) => {
      if (url === endpoint && JSON.parse(init.body).params.name === name) {
        return Response.json({
          id: 1,
          result: { content: [{ type: 'text', text: '{"dry_run":true}' }] },
        });
      }
      return fetch(url, init);
    };
    const [receipt] = await run(f.env, f.rt);
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.written, 0);
    assert.equal(f.rows.size, 0);
  }
});

test('MCP supports SSE and rejects errors, missing results, and ambiguous sidecars', async () => {
  const sse = setup();
  sse.state.wire = 'sse';
  assert.equal((await run(sse.env, sse.rt))[0].written, 1);
  for (const body of [
    { id: 1, error: { message: origin } },
    { id: 1, result: { content: [] } },
    { id: 1, result: { content: [{ type: 'text', text: '{}' }] } },
    { id: 1, result: { content: [{ type: 'text', text: '[{},{}]' }] } },
    {
      id: 1,
      result: {
        content: [{ type: 'text', text: '[{"source":"wrong","data":{}}]' }],
      },
    },
  ]) {
    const f = setup();
    f.state.rpcError = () => Response.json(body);
    assert.equal((await run(f.env, f.rt))[0].status, 'failed');
    assert.equal(f.rows.size, 0);
  }
});

test('failures remain anonymous and one failed source does not block its siblings', async () => {
  const f = setup([
    source(),
    source({
      code: 'SRC-2',
      discoveryUrl: `${origin}/feed.xml`,
      discoveryKind: 'feed',
    }),
  ]);
  f.pages.set(
    `${origin}/sitemap.xml`,
    new Error(`private upstream failed: ${origin}`)
  );
  f.pages.set(
    `${origin}/feed.xml`,
    `<rss><channel><item><link>${origin}/articles/one</link></item></channel></rss>`
  );
  const receipts = await run(f.env, f.rt);
  assert.deepEqual(
    receipts.map(r => r.status),
    ['failed', 'ok']
  );
  assert.doesNotMatch(
    JSON.stringify(receipts),
    /https|example|private upstream/
  );
});

test('invalid registry or sink configuration fails before network access', async () => {
  for (const bad of [
    [],
    [source(), source()],
    [source({ identityTerms: [] })],
    [source({ code: 'real-name' })],
    [source({ origin: 'http://source.example.com' })],
    [source({ origin: 'https://127.0.0.1' })],
    [source({ origin: 'https://[::1]' })],
    [source({ intervalMs: 0 })],
    [source({ discoveryUrl: 'https://other.example.com/' })],
    [source({ approved: 'true' })],
    [source({ maxPages: 101 })],
    [source({ contentTag: 'body' })],
  ])
    assert.throws(
      () => sourcesFromSecret(JSON.stringify(bad)),
      /configuration_invalid/
    );
  assert.throws(
    () => sourcesFromSecret('secret invalid input'),
    /configuration_invalid/
  );
  for (const config of [
    { GBRAIN_API_KEY: '' },
    { GBRAIN_MCP_URL: 'http://localhost/mcp' },
  ]) {
    const f = setup();
    await assert.rejects(
      run({ ...f.env, ...config }, f.rt),
      /configuration_invalid/
    );
    assert.equal(f.calls.length, 0);
  }
});

test('identity redaction handles literal punctuation, case, links and HTML entities', () => {
  const s = sourcesFromSecret(
    JSON.stringify([source({ identityTerms: ['Fixture Source', 'A+B'] })])
  )[0];
  assert.equal(
    anonymize(
      'FIXTURE SOURCE A+B https://else.example.com/x writer@else.example.com else.example.com',
      s
    ),
    'SRC-1 SRC-1 [link] [contact] [domain]'
  );
  assert.match(
    extractArticle(article('Fixture&#32;Source'), s).title,
    /^SRC-1$/
  );
  assert.equal(
    extractArticle(article('Fixture&nbsp;Source'), s).title,
    'SRC-1'
  );
  assert.equal(anonymize('Fixture\nSource', s), 'SRC-1');
  assert.equal(anonymize('Ｆｉｘｔｕｒｅ Source', s), 'SRC-1');
  assert.throws(
    () => extractArticle('<main>short</main>', s),
    /content_missing/
  );
  assert.throws(
    () => extractArticle('<article>short</article>', s),
    /content_missing/
  );
});

test('discovery and run budgets terminate without unbounded requests', async () => {
  const f = setup([source({ maxDiscoveryRequests: 1 })]);
  f.pages.set(
    `${origin}/sitemap.xml`,
    `<sitemapindex><sitemap><loc>${origin}/next.xml</loc></sitemap></sitemapindex>`
  );
  assert.equal((await run(f.env, f.rt))[0].reason, 'discovery_limit');
  const budget = setup();
  const sleep = budget.rt.sleep;
  budget.rt.sleep = async ms => {
    await sleep(ms);
    budget.tick(600_001);
  };
  assert.equal(
    (await run(budget.env, budget.rt))[0].reason,
    'run_budget_exceeded'
  );
});

test('HTTP reads cap decoded bytes and retry transient errors exactly once', async () => {
  let calls = 0;
  const rt = {
    now: Date.now,
    sleep: async () => {},
    fetch: async () => {
      calls++;
      return new Response('large');
    },
  };
  await assert.rejects(
    requestText(rt, origin, {}, async () => {}, 2),
    /response_too_large/
  );
  assert.equal(calls, 1);
  rt.fetch = async () => {
    calls++;
    if (calls === 2) throw new Error(origin);
    return new Response('ok');
  };
  assert.equal(await requestText(rt, origin, {}, async () => {}), 'ok');
  assert.equal(calls, 3);
});

test('scheduled handler reports incomplete runs and exposes no HTTP content', async t => {
  assert.equal(worker.fetch().status, 404);
  const f = setup([source({ approved: false })]);
  t.mock.method(console, 'info', text => {
    assert.doesNotMatch(text, /example|Fixture/);
  });
  let pending;
  const realFetch = globalThis.fetch;
  globalThis.fetch = f.rt.fetch;
  try {
    worker.scheduled({}, f.env, {
      waitUntil(promise) {
        pending = promise;
      },
    });
    await assert.rejects(pending, /knowledge_ingest_incomplete/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('existing CI lane selects and runs Worker checks', () => {
  assert.ok(
    classifyProductLanes([
      'workers/knowledge-ingest/src/index.ts',
    ]).selectedLanes.includes('web')
  );
  const ci = readFileSync(
    new URL('../../../.github/workflows/ci.yml', import.meta.url),
    'utf8'
  );
  assert.ok(
    ci.includes(
      'pnpm --filter @jovie/knowledge-ingest typecheck && pnpm --filter @jovie/knowledge-ingest test'
    )
  );
});
