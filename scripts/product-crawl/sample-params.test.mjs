import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ACCEPTED_UNCOVERED,
  SIGNED_IN_SAFE,
  SIGNED_IN_SKIP,
  skipSignedIn,
  uncoveredEntry,
} from './accepted-uncovered.mjs';
import { productReady } from './ready-gate.mjs';
import {
  coverRoute,
  followUps,
  matchRoute,
  pickSamples,
  playlistTags,
  repoSamples,
  SAMPLE_SOURCES,
  sitemapPaths,
} from './sample-params.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const at = p => join(root, p);
const io = {
  read: p => (existsSync(at(p)) ? readFileSync(at(p), 'utf8') : null),
  list: d => (existsSync(at(d)) ? readdirSync(at(d)) : []),
  exists: p => existsSync(at(p)),
};
const inventory = JSON.parse(
  io.read('docs/product/generated/artist-launch-inventory.json')
);
const routes = [
  ...new Set(
    inventory.inventory.filter(i => i.kind === 'page').map(i => i.route)
  ),
].sort();
// What crawl.mjs's concrete() fills from the handle alone.
const handleOnly = r => !r.replace(/^\/\[username\]/, '/tim').includes('[');
const dynamic = routes.filter(r => r.includes('[') && !handleOnly(r));
const repo = repoSamples({ ...io, handle: 'tim' });
const hosts = new Set(['jovie-abc-jovie.vercel.app', 'jov.ie']);
const GENERIC = 'needs sample data for its parameters';

test('every dynamic page route has a sample source or a reviewed exception', () => {
  const unplanned = dynamic.filter(
    r => !SAMPLE_SOURCES[r] && !ACCEPTED_UNCOVERED[r]
  );
  assert.deepEqual(unplanned, []);
  for (const r of dynamic) {
    const c = coverRoute(r, new Map(), { signedIn: true });
    assert.ok(c.uncovered, r);
    assert.notEqual(c.uncovered.reason, GENERIC, r);
  }
});

test('repo samples are the constants the pages check, on public URLs', () => {
  const get = r => repo.samples.get(r)?.target;
  const surfaces = io.read(
    'apps/web/components/features/demo/showcase-surfaces.ts'
  );
  const surface = get('/demo/showcase/[surface]').split('/').pop();
  assert.match(surfaces, new RegExp(`'${surface}'`));
  assert.equal(get('/renders/[state]'), '/renders/mock-home');
  assert.equal(get('/renders/surfaces/[surface]'), '/renders/surfaces/profile');
  const story = get('/engineering/preview/[slug]').split('/').pop();
  assert.ok(io.exists(`apps/web/content/engineering/${story}.md`));
  // next.config.js rewrites these public URLs to the two private routes.
  assert.equal(
    get('/[username]/profile-mode-render/[profileMode]/[marker]'),
    '/tim?mode=listen'
  );
  assert.equal(get('/[username]/[...slug]'), '/tim/listen');
  for (const [route, { target }] of repo.samples) {
    if (route.startsWith('/[username]/')) continue; // reached by rewrite
    assert.equal(matchRoute(target, routes), route, target);
  }
  assert.ok(repo.reserved.has('listen') && repo.reserved.has('ig'));
});

test('a path lands on the most specific route, as Next routes it', () => {
  const cases = {
    '/tim/shop': '/[username]/shop',
    '/tim/one-more-time': '/[username]/[slug]',
    '/tim/one-more-time/intro': '/[username]/[slug]/[trackSlug]',
    '/tim/one-more-time/download': '/[username]/[slug]/download',
    '/tim/a/b/c/d': '/[username]/[...slug]',
    '/blog/the-friday-problem': '/blog/[slug]',
    '/app/admin/lists/views/v1': '/app/admin/lists/views/[viewId]',
    '/pricing': '/pricing',
  };
  for (const [path, route] of Object.entries(cases))
    assert.equal(matchRoute(path, routes), route, path);
});

test('the sitemap gives one sample per content route, on this deploy', () => {
  const xml = `<urlset>
    <url><loc>https://jov.ie/blog/the-friday-problem</loc></url>
    <url><loc>https://jov.ie/blog/authors/tim</loc></url>
    <url><loc>https://jov.ie/changelog/2026.11.1?a=1&amp;b=2</loc></url>
    <url><loc>https://elsewhere.example/compare/linktree</loc></url>
  </urlset>`;
  assert.deepEqual(sitemapPaths(xml, hosts), [
    '/blog/the-friday-problem',
    '/blog/authors/tim',
    '/changelog/2026.11.1',
  ]);
  const samples = pickSamples({
    routes,
    handle: 'tim',
    hosts,
    repo,
    sitemap: sitemapPaths(xml, hosts),
  });
  assert.equal(samples.get('/blog/[slug]').target, '/blog/the-friday-problem');
  assert.equal(samples.get('/blog/[slug]').source, '/sitemap.xml');
  assert.equal(samples.has('/compare/[slug]'), false);
});

const origin = 'https://jovie-abc-jovie.vercel.app';
const production = {
  sitemap: [
    '/alternatives/linktree',
    '/compare/linkfire',
    '/blog/the-friday-problem',
    '/blog/authors/tim',
    '/blog/category/release-strategy',
    '/changelog/2026.11.1',
    '/solutions/djs',
    '/playlists/late-night-drive',
    '/dualipa',
    '/dualipa/houdini',
    '/tim/one-more-time',
    '/tim/one-more-time/intro',
  ],
  pages: [
    {
      url: '/tim',
      paths: [
        `${origin}/tim/listen`,
        `${origin}/tim/ig`,
        `${origin}/go/abc`,
        `${origin}/tim/merch/0b5f7c8e-1d2a-4c3b-9e8f-7a6b5c4d3e2f`,
        `${origin}/a/tim/press-kit`,
        `${origin}/out/x1Y2`,
        'https://open.spotify.com/artist/1',
      ],
    },
    {
      url: '/tim/one-more-time',
      paths: [`${origin}/tim/one-more-time/download`],
    },
    {
      url: '/playlists/late-night-drive',
      ld: [{ '@type': 'MusicPlaylist', genre: ['synthwave'] }],
      keywords:
        'Late Night Drive,synthwave,nocturnal,curated playlist,spotify playlist',
    },
    { url: '/app/releases', releaseIds: ['rel-1'] },
    { url: '/app/chat', paths: [`${origin}/app/chat/conv-1`] },
    { url: '/app/admin/wiki', paths: [`${origin}/app/ov/wiki/people/tim`] },
    { url: '/app/admin/lists', paths: [`${origin}/app/ov/lists/l1`] },
  ],
};

test('links, ids and tags on loaded pages fill the artist and app routes', () => {
  const s = pickSamples({ routes, handle: 'tim', hosts, repo, ...production });
  const t = r => s.get(r)?.target;
  // The crawl handle's release wins over another artist's in the sitemap.
  assert.equal(t('/[username]/[slug]'), '/tim/one-more-time');
  assert.equal(t('/[username]/[slug]/sounds'), '/tim/one-more-time/sounds');
  assert.equal(t('/[username]/[slug]/download'), '/tim/one-more-time/download');
  assert.equal(t('/[username]/[slug]/[trackSlug]'), '/tim/one-more-time/intro');
  assert.equal(t('/a/[handle]/[slug]'), '/a/tim/press-kit');
  assert.equal(t('/out/[id]'), '/out/x1Y2');
  assert.equal(t('/playlists/genre/[genre]'), '/playlists/genre/synthwave');
  assert.equal(t('/playlists/mood/[mood]'), '/playlists/mood/nocturnal');
  assert.equal(
    t('/app/releases/[releaseId]/tasks'),
    '/app/releases/rel-1/tasks'
  );
  assert.equal(t('/app/lyrics/[trackId]'), '/app/lyrics/rel-1');
  assert.equal(t('/app/chat/[id]'), '/app/chat/conv-1');
  assert.equal(t('/app/admin/lists/[id]'), '/app/admin/lists/l1');
  assert.equal(t('/hud/wiki/[...slug]'), '/hud/wiki/people/tim');
  // Rewritten aliases are not releases; the repo samples still stand.
  assert.equal(t('/[username]/[...slug]'), '/tim/listen');
  assert.deepEqual(followUps(s), [
    '/tim/one-more-time',
    '/playlists/late-night-drive',
  ]);
});

test('a playlist page names its genres, and its moods sit between in keywords', () => {
  assert.deepEqual(playlistTags(production.pages[2]), {
    genres: ['synthwave'],
    moods: ['nocturnal'],
  });
  assert.deepEqual(
    playlistTags({ url: '/playlists/x', keywords: 'x,curated playlist' }),
    { genres: [], moods: [] }
  );
});

test("only a playlist's own page names tags, not the index's default keywords", () => {
  const keywords =
    'Jovie,public profile,personal website,control your presence';
  const none = { genres: [], moods: [] };
  assert.deepEqual(playlistTags({ url: '/playlists', keywords }), none);
  assert.deepEqual(
    playlistTags({ url: '/playlists/mood/chill', keywords }),
    none
  );
  assert.deepEqual(playlistTags({ url: '/tim', keywords }), none);
  assert.deepEqual(playlistTags({ url: '/playlists/late-night', keywords }), {
    genres: [],
    moods: ['public profile'],
  });
});

test('a sample beats an exception; an exception is accepted; else the reason shows', () => {
  const s = new Map([['/out/[id]', { target: '/out/x1Y2', source: 'link' }]]);
  assert.equal(
    coverRoute('/out/[id]', s, { signedIn: true }).target,
    '/out/x1Y2'
  );
  assert.deepEqual(coverRoute('/p/[token]', s, { signedIn: true }).uncovered, {
    route: '/p/[token]',
    reason: ACCEPTED_UNCOVERED['/p/[token]'],
    accepted: true,
  });
  const chat = coverRoute('/app/chat/[id]', s, { signedIn: false }).uncovered;
  assert.equal(chat.accepted, undefined);
  assert.match(chat.reason, /signed-in page/);
  assert.deepEqual(uncoveredEntry('/billing/cancel', 'x').accepted, true);
  assert.deepEqual(uncoveredEntry('/pricing', 'x'), {
    route: '/pricing',
    reason: 'x',
  });
});

test('with production data every route is crawled or a reviewed exception', () => {
  const s = pickSamples({ routes, handle: 'tim', hosts, repo, ...production });
  const loaded = id => r => ({
    route: r,
    identity: id,
    viewport: 'desktop',
    status: 200,
  });
  const pages = [];
  const uncovered = [];
  for (const r of routes) {
    const c = handleOnly(r)
      ? { target: r }
      : coverRoute(r, s, { signedIn: true });
    if (c.uncovered) uncovered.push(c.uncovered);
    else {
      pages.push(loaded('stranger')(r));
      if (!skipSignedIn(r)) pages.push(loaded('signed-in')(r));
    }
    if (skipSignedIn(r)) uncovered.push(uncoveredEntry(r, 'skipped'));
  }
  // Signed-in only routes: a stranger meets the sign-in wall.
  for (const p of pages)
    if (p.identity === 'stranger' && /^\/(app|billing)(\/|$)/.test(p.route))
      p.authGated = true;
  const receipt = {
    origin: 'https://jov.ie',
    at: '2026-11-08T02:00:00Z',
    routes,
    pages,
    uncovered,
  };
  const now = Date.parse('2026-11-08T03:00:00Z');
  assert.deepEqual(productReady(receipt, { now }).reasons, []);
  // Without the reviewed list, the same crawl is not ready.
  const unreviewed = uncovered.map(({ accepted, ...u }) => u);
  const r = productReady({ ...receipt, uncovered: unreviewed }, { now });
  assert.match(r.reasons.join(), /page routes not crawled/);
});

test('the reviewed exceptions stay true to the repo', () => {
  for (const [route, reason] of Object.entries(ACCEPTED_UNCOVERED)) {
    assert.ok(routes.includes(route), `${route} is not a page route`);
    assert.ok(reason.length > 40, `${route} needs a concrete reason`);
  }
  for (const r of routes.filter(x => SIGNED_IN_SKIP.test(x)))
    assert.ok(SIGNED_IN_SAFE[r] || ACCEPTED_UNCOVERED[r], r);
  // Loaded signed in only because the page is just a server redirect.
  for (const file of Object.values(SIGNED_IN_SAFE)) {
    const src = io.read(file);
    assert.match(src, /\bredirect\(/, file);
    assert.doesNotMatch(src, /'use client'|useEffect|fetch\(/, file);
  }
  // "/engineering/[slug]" is excepted only while no story is published.
  const eng = 'apps/web/content/engineering';
  for (const f of io.list(eng).filter(x => x.endsWith('.md'))) {
    const meta = JSON.parse(io.read(`${eng}/${f}`).split('\n')[1]);
    assert.notEqual(meta.status, 'published', `${f} is published`);
  }
});

test('a sitemap that could not be read is named, never passed as reviewed', () => {
  // Sentry 4505477848: a failed /sitemap.xml fetch read as an empty sitemap
  // left /engineering/[slug] on its reviewed exception, so a published story
  // the sitemap would have listed went uncrawled while the gate passed.
  const opts = { signedIn: true, sitemapProblem: 'HTTP 503' };
  assert.deepEqual(
    coverRoute('/engineering/[slug]', new Map(), opts).uncovered,
    {
      route: '/engineering/[slug]',
      reason:
        '/sitemap.xml could not be read (HTTP 503), so this route was not sampled',
    }
  );
  assert.match(
    coverRoute('/blog/[slug]', new Map(), opts).uncovered?.reason ?? '',
    /HTTP 503/
  );
  // Routes not sampled from the sitemap keep their own reason.
  assert.equal(
    coverRoute('/out/[id]', new Map(), opts).uncovered?.accepted,
    true
  );
});
