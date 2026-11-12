// Real values for the crawl's dynamic page routes (Tim, 2026-11-08: the
// crawl said "43 page routes not crawled"). Pure: crawl.mjs gathers inputs.
// Each sample comes from where the app itself gets the value:
//  - repo: the constant the page checks its param against, read from source;
//  - sitemap: the deployed /sitemap.xml, which app/sitemap.ts builds from the
//    same functions the pages' generateStaticParams call (content files,
//    publication records, the database), so drafts never become samples;
//  - links: hrefs and ids on pages the crawl loads (the cert handle's
//    profile and shop, a release page, a playlist page, signed-in lists).
// Nothing is made up: a route with no sample is reported with the reason.
import { uncoveredEntry } from './accepted-uncovered.mjs';

const WEB = 'apps/web';

// Every dynamic page route the crawl can sample, and what the receipt says
// when it finds none. signedIn: the value is read from a signed-in page.
export const SAMPLE_SOURCES = Object.freeze({
  '/[username]/[...slug]': {
    missing:
      'next.config.js profileModeAliasRewrites has no alias without a page of its own',
  },
  '/[username]/profile-mode-render/[profileMode]/[marker]': {
    missing: 'next.config.js profileQueryModePattern was not found',
  },
  '/demo/showcase/[surface]': {
    missing: 'DEMO_SHOWCASE_SURFACE_IDS was not found in showcase-surfaces.ts',
  },
  '/renders/[state]': {
    missing: 'HOMEPAGE_PROFILE_SHOWCASE_STATES was not found',
  },
  '/renders/surfaces/[surface]': {
    missing: 'MARKETING_RENDER_ROUTE_SURFACES was not found',
  },
  '/engineering/preview/[slug]': {
    missing: 'content/engineering has no story',
  },
  '/alternatives/[slug]': {
    missing: 'no /alternatives/ entry in /sitemap.xml',
  },
  '/compare/[slug]': { missing: 'no /compare/ entry in /sitemap.xml' },
  '/blog/[slug]': { missing: 'no /blog/ post in /sitemap.xml' },
  '/blog/authors/[username]': { missing: 'no blog author in /sitemap.xml' },
  '/blog/category/[slug]': { missing: 'no blog category in /sitemap.xml' },
  '/changelog/[version]': { missing: 'no /changelog/ release in /sitemap.xml' },
  '/engineering/[slug]': { missing: 'no /engineering/ story in /sitemap.xml' },
  '/solutions/[audience]': { missing: 'no /solutions/ page in /sitemap.xml' },
  '/playlists/[slug]': {
    missing: 'no published playlist in /sitemap.xml',
  },
  '/playlists/genre/[genre]': {
    missing: 'the sampled playlist page names no genre (JSON-LD genre)',
  },
  '/playlists/mood/[mood]': {
    missing: 'the sampled playlist page names no mood tag (meta keywords)',
  },
  '/[username]/[slug]': {
    missing:
      'no public release for the crawl handle or any sitemap profile, on its profile or in /sitemap.xml',
  },
  '/[username]/[slug]/[trackSlug]': {
    missing: 'no track link on the sampled release page or in /sitemap.xml',
  },
  '/[username]/[slug]/download': {
    missing:
      'the sampled release page links no promo download (the page 404s unless the artist is Pro with active downloads)',
  },
  '/[username]/[slug]/sounds': { missing: 'no public release to sample' },
  '/[username]/merch/[cardId]': {
    missing: 'no merch card link on the crawl handle profile or shop',
  },
  '/a/[handle]/[slug]': {
    missing: 'no public asset share link on the crawl handle profile',
  },
  '/out/[id]': { missing: 'no wrapped link on the crawl handle profile' },
  '/app/chat/[id]': {
    signedIn: true,
    missing: 'signed-in /app/chat links no conversation for the crawl account',
  },
  '/app/releases/[releaseId]/tasks': {
    signedIn: true,
    missing: 'signed-in /app/releases shows no release for the crawl account',
  },
  '/app/dashboard/releases/[releaseId]/tasks': {
    signedIn: true,
    missing: 'signed-in /app/releases shows no release for the crawl account',
  },
  '/app/dashboard/releases/[releaseId]/downloads': {
    signedIn: true,
    missing: 'signed-in /app/releases shows no release for the crawl account',
  },
  // lyrics-data.ts resolves the id as a recording, a legacy track, then a
  // release, so a release id from /app/releases is a real lyrics target.
  '/app/lyrics/[trackId]': {
    signedIn: true,
    missing: 'signed-in /app/releases shows no release for the crawl account',
  },
  '/app/admin/agent-runs/[id]': {
    signedIn: true,
    missing: 'signed-in /app/admin/agent-runs links no run',
  },
  '/app/admin/lists/[id]': {
    signedIn: true,
    missing: 'signed-in /app/admin/lists links no list',
  },
  '/app/admin/lists/views/[viewId]': {
    signedIn: true,
    missing: 'signed-in /app/admin/lists links no saved view',
  },
  '/app/admin/wiki/[...slug]': {
    signedIn: true,
    missing: 'signed-in /app/admin/wiki links no page',
  },
  '/hud/wiki/[...slug]': {
    signedIn: true,
    missing: 'signed-in /app/admin/wiki links no page',
  },
});

// Pages whose links and ids are read before the crawl (desktop viewport).
/** @param {string} handle */
export const strangerDiscovery = handle => [`/${handle}`, `/${handle}/shop`];
export const SIGNED_IN_DISCOVERY = Object.freeze([
  '/app/releases',
  '/app/chat',
  '/app/admin/agent-runs',
  '/app/admin/lists',
  '/app/admin/wiki',
]);

// Runs in the page, so it is a string: these scripts type-check as Node.
export const COLLECT = `(() => {
  const all = s => [...document.querySelectorAll(s)];
  const ld = [];
  for (const s of all('script[type="application/ld+json"]')) {
    try { ld.push(JSON.parse(s.textContent || '')); } catch {}
  }
  return {
    paths: all('a[href]').map(a => a.href),
    releaseIds: [
      ...all('[data-release-id]').map(e => e.getAttribute('data-release-id')),
      ...all('[data-testid^="mobile-release-row-"]').map(e => e.getAttribute('data-testid').slice(19)),
    ].filter(Boolean),
    ld,
    keywords: document.querySelector('meta[name="keywords"]')?.getAttribute('content') ?? '',
  };
})()`;

const segs = p => p.split('/').filter(Boolean);

/** Next's precedence: a static segment beats [param] beats [...catchAll]. */
function score(route, path) {
  const r = segs(route);
  const p = segs(path);
  const out = [];
  for (let i = 0; i < r.length; i += 1) {
    if (i >= p.length) return null;
    if (r[i].startsWith('[...')) return [...out, 0];
    if (r[i].startsWith('[')) out.push(1);
    else if (r[i] === p[i]) out.push(2);
    else return null;
  }
  return p.length === r.length ? out : null;
}

/** The page route a path lands on, or null. @param {string} path @param {string[]} routes */
export function matchRoute(path, routes) {
  let best = null;
  let bestScore = null;
  for (const route of routes) {
    const s = score(route, path);
    if (!s) continue;
    const k = bestScore ? s.findIndex((v, i) => v !== bestScore[i]) : 0;
    if (!bestScore || (k !== -1 && (s[k] ?? -1) > (bestScore[k] ?? -1))) {
      best = route;
      bestScore = s;
    }
  }
  return best;
}

/** Same-site pathname of a URL; admin's /app/ov alias reads as /app/admin. */
export function pathOf(url, hosts) {
  let u;
  try {
    u = new URL(url, 'https://jov.ie');
  } catch {
    return null;
  }
  if (!hosts.has(u.host)) return null;
  return u.pathname.replace(/^\/app\/ov(?=\/|$)/, '/app/admin');
}

/** @param {string} xml @param {Set<string>} hosts */
export function sitemapPaths(xml, hosts) {
  return [...(xml ?? '').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map(m => pathOf(m[1].replaceAll('&amp;', '&'), hosts))
    .filter(Boolean);
}

/**
 * Samples read from the repo: the constant each page checks its param with.
 * @param {{ read: (p: string) => string | null, list: (d: string) => string[],
 *   exists: (p: string) => boolean, handle: string }} io
 */
export function repoSamples({ read, list, exists, handle }) {
  const samples = new Map();
  const put = (route, target, source) =>
    target && samples.set(route, { target, source });
  const grab = (file, re) => read(file)?.match(re)?.[1] ?? null;
  const quoted = s => [...(s ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]);

  const demo = `${WEB}/components/features/demo/showcase-surfaces.ts`;
  const surface = quoted(
    grab(demo, /DEMO_SHOWCASE_SURFACE_IDS\s*=\s*\[([^\]]*)\]/)
  )[0];
  put('/demo/showcase/[surface]', surface && `/demo/showcase/${surface}`, demo);

  const states = `${WEB}/components/features/home/homepage-profile-preview-fixture.ts`;
  const state = grab(
    states,
    /HOMEPAGE_PROFILE_SHOWCASE_STATES:[^=]*=\s*\{\s*'([^']+)'\s*:/
  );
  put('/renders/[state]', state && `/renders/${state}`, states);

  const surfaces = `${WEB}/components/features/home/MarketingRenderSurface.tsx`;
  const routeSurface = grab(
    surfaces,
    /MARKETING_RENDER_ROUTE_SURFACES\s*=\s*\[\s*\{\s*id:\s*'([^']+)'/
  );
  put(
    '/renders/surfaces/[surface]',
    routeSurface && `/renders/surfaces/${routeSurface}`,
    surfaces
  );

  // engineering-publication.ts: one story per .md; preview lists them all.
  const eng = `${WEB}/content/engineering`;
  const story = list(eng)
    .filter(f => f.endsWith('.md'))
    .map(f => f.slice(0, -3))
    .filter(s => s !== 'preview' && s !== 'feed')
    .sort()[0];
  put(
    '/engineering/preview/[slug]',
    story && `/engineering/preview/${story}`,
    eng
  );

  // next.config.js rewrites /<handle>?mode=<m> to the private render route
  // and /<handle>/<alias> to the [...slug] resolver; crawl the public URL.
  const cfg = `${WEB}/next.config.js`;
  const modes =
    grab(
      cfg,
      /profileQueryModePattern\s*=\s*'\^\(\?<profileMode>([a-z|]+)\)\$'/
    )?.split('|') ?? [];
  put(
    '/[username]/profile-mode-render/[profileMode]/[marker]',
    modes[0] && `/${handle}?mode=${modes[0]}`,
    `${cfg} profileQueryModePattern`
  );
  const aliases = quoted(
    grab(cfg, /profileModeAliasRewrites\s*=\s*\[([^\]]*)\]/)
  );
  const alias = aliases.find(
    a => !exists(`${WEB}/app/[username]/${a}/page.tsx`)
  );
  put(
    '/[username]/[...slug]',
    alias && `/${handle}/${alias}`,
    `${cfg} profileModeAliasRewrites`
  );
  // Second segments the rewrites send elsewhere, never to /[username]/[slug].
  const social = grab(cfg, /:platform\(([a-z|]+)\)/)?.split('|') ?? [];
  const reserved = new Set([...aliases, ...social, 's']);
  return { samples, reserved };
}

// A playlist's own page; the index and the genre and mood hubs carry the
// site's default keywords, which are not tags.
const PLAYLIST_PAGE = /^\/playlists\/(?!genre\/|mood\/)[^/?#]+$/;

/** Genres and moods a playlist page names (app/(dynamic)/playlists/[slug]). */
export function playlistTags(page) {
  if (!PLAYLIST_PAGE.test(page.url ?? '')) return { genres: [], moods: [] };
  const genres = [];
  const walk = v => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      if (v['@type'] === 'MusicPlaylist' && Array.isArray(v.genre))
        genres.push(...v.genre.filter(g => typeof g === 'string'));
      Object.values(v).forEach(walk);
    }
  };
  walk(page.ld ?? []);
  // Its keywords are [title, ...genreTags, ...moodTags, 'curated playlist',
  // 'spotify playlist'], so the moods are what sits between.
  const kw = (page.keywords ?? '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);
  const moods = kw.length > 3 ? kw.slice(1, -2) : [];
  return { genres, moods: moods.filter(m => !genres.includes(m)) };
}

const RELEASE_ID_TARGETS = [
  id => `/app/releases/${id}/tasks`,
  id => `/app/dashboard/releases/${id}/tasks`,
  id => `/app/dashboard/releases/${id}/downloads`,
  id => `/app/lyrics/${id}`,
];

/**
 * One sample per dynamic route: route -> { target, source }.
 * @param {{ routes: string[], handle: string, hosts: Set<string>,
 *   repo: ReturnType<typeof repoSamples>, sitemap?: string[],
 *   pages?: { url: string, paths?: string[], releaseIds?: string[],
 *     ld?: unknown[], keywords?: string }[] }} input
 */
export function pickSamples({
  routes,
  handle,
  hosts,
  repo,
  sitemap = [],
  pages = [],
}) {
  const me = handle.toLowerCase();
  const known = new Set([me]);
  for (const p of sitemap)
    if (matchRoute(p, routes) === '/[username]')
      known.add(segs(p)[0].toLowerCase());
  const candidates = [];
  for (const page of pages) {
    const source = `link on ${page.url}`;
    for (const u of page.paths ?? []) {
      const path = pathOf(u, hosts);
      if (path) candidates.push({ path, source });
    }
    for (const id of page.releaseIds ?? [])
      for (const t of RELEASE_ID_TARGETS)
        candidates.push({
          path: t(encodeURIComponent(id)),
          source: `release id on ${page.url}`,
        });
    const { genres, moods } = playlistTags(page);
    for (const g of genres)
      candidates.push({
        path: `/playlists/genre/${encodeURIComponent(g)}`,
        source: `genre on ${page.url}`,
      });
    for (const m of moods)
      candidates.push({
        path: `/playlists/mood/${encodeURIComponent(m)}`,
        source: `mood tag on ${page.url}`,
      });
  }
  for (const path of sitemap) candidates.push({ path, source: '/sitemap.xml' });

  const byRoute = new Map();
  for (const c of candidates) {
    const route = matchRoute(c.path, routes);
    if (!route?.includes('[') || route === '/[username]') continue;
    const s = segs(c.path);
    if (route.startsWith('/[username]/')) {
      if (!known.has(s[0].toLowerCase()) || repo.reserved.has(s[1])) continue;
    }
    const mine = s.some(x => x.toLowerCase() === me) ? 0 : 1;
    if (!byRoute.has(route)) byRoute.set(route, []);
    byRoute.get(route).push({ ...c, mine });
  }
  const samples = new Map();
  for (const [route, list] of byRoute) {
    const best = list.reduce((a, b) => (b.mine < a.mine ? b : a));
    samples.set(route, { target: best.path, source: best.source });
  }
  // A release's "use this sound" page exists for every public release.
  const release = samples.get('/[username]/[slug]');
  if (release && !samples.has('/[username]/[slug]/sounds'))
    samples.set('/[username]/[slug]/sounds', {
      target: `${release.target}/sounds`,
      source: `${release.source} (the release's sounds page)`,
    });
  const wiki = samples.get('/app/admin/wiki/[...slug]');
  if (wiki && !samples.has('/hud/wiki/[...slug]'))
    samples.set('/hud/wiki/[...slug]', {
      target: wiki.target.replace(/^\/app\/admin\/wiki/, '/hud/wiki'),
      source: `${wiki.source} (/hud/wiki rewrites to the admin wiki)`,
    });
  // Repo constants win: they are the exact values the page checks.
  for (const [route, s] of repo.samples) samples.set(route, s);
  return samples;
}

/** Pages to read on a second pass: the sampled release and playlist. */
export const followUps = samples =>
  ['/[username]/[slug]', '/playlists/[slug]']
    .map(r => samples.get(r)?.target)
    .filter(Boolean);

/**
 * How the crawl covers a dynamic route: the sample's target, or the receipt's
 * uncovered entry (reviewed and accepted, or with the specific reason).
 * @param {string} route @param {Map<string, { target: string, source: string }>} samples
 * When /sitemap.xml could not be read, a route sampled from it is reported
 * with that problem and never as a reviewed exception, so a failed fetch
 * can't pass the gate in place of a page the sitemap would have listed.
 * @param {{ signedIn: boolean, sitemapProblem?: string | null }} opts
 */
export function coverRoute(
  route,
  samples,
  { signedIn, sitemapProblem = null }
) {
  const s = samples.get(route);
  if (s) return { target: s.target, source: s.source };
  const known = SAMPLE_SOURCES[route];
  if (sitemapProblem && known?.missing?.includes('/sitemap.xml'))
    return {
      uncovered: {
        route,
        reason: `/sitemap.xml could not be read (${sitemapProblem}), so this route was not sampled`,
      },
    };
  const reason = !known
    ? 'needs sample data for its parameters'
    : known.signedIn && !signedIn
      ? 'its value is read from a signed-in page, and this crawl had no session'
      : known.missing;
  return { uncovered: uncoveredEntry(route, reason) };
}
