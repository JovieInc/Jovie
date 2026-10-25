// Production dogfood agent core: pure check logic, receipts and finding
// shaping. No network or filesystem access here; callers inject `probe`.
//
// A "mission" is one outcome a real visitor needs (the same ids as the
// outcome missions in apps/web/lib/canonical-surfaces.ts and the assurance
// matrix). A mission is certified only when every check passed on production,
// bound to the exact deployed commit. Anything unverified or blocked is
// uncertified, never silently green.
import { createHash } from 'node:crypto';

export const RECEIPT_SCHEMA = 'jovie.dogfood-receipt/v1';
export const CERTIFICATION_SCHEMA = 'jovie.prod-dogfood-certification/v1';

/** Linear priority numbers (1 urgent .. 4 low) per severity. */
export const SEVERITY = {
  P0: { priority: 1, label: 'P0' },
  P1: { priority: 2, label: 'P1' },
  P2: { priority: 3, label: 'P2' },
  P3: { priority: 4, label: 'P3' },
};

/** Order-preserving bounded concurrency; probes are independent GETs. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return out;
}

export const PROBE_CONCURRENCY = 6;

export function sha8(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 8);
}

/** Stable dedup key: mission + check + target. Matches the remediation key regex. */
export function fingerprintFor({ mission, check, target }) {
  const slug = s =>
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return `dogfood-${slug(String(mission).replace(/^dogfood:/, ''))}-${slug(check)}-${sha8(target)}`.slice(
    0,
    70
  );
}

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};
export function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCodePoint(Number.parseInt(h, 16))
    )
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(?:amp|lt|gt|quot|apos);/g, m => ENTITIES[m]);
}

export function parseJsonLd(html) {
  const out = [];
  const re =
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of String(html ?? '').matchAll(re)) {
    try {
      const json = JSON.parse(m[1]);
      for (const node of Array.isArray(json) ? json : [json]) {
        if (node && Array.isArray(node['@graph'])) out.push(...node['@graph']);
        else if (node) out.push(node);
      }
    } catch {
      // Malformed JSON-LD is itself reported by the caller (no nodes parsed).
    }
  }
  return out;
}

export function pageTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html ?? ''));
  return m ? decodeEntities(m[1]).trim() : '';
}

export function canonicalOf(html) {
  const m = /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i.exec(
    String(html ?? '')
  );
  return m ? decodeEntities(m[1]) : null;
}

export function isNoindex(html) {
  return /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(
    String(html ?? '')
  );
}

/** The "Coming soon" shell served for a release row that is not public. */
export function isComingSoon(html) {
  return /^coming soon\b/i.test(pageTitle(html));
}

const FAIL_TEXT =
  /(application error|something went wrong|internal server error|this page could not be found|page not found)/i;
export function hasErrorShell(text) {
  return FAIL_TEXT.test(String(text ?? ''));
}

/** Release page URLs (https://host/<handle>/<slug>) advertised in JSON-LD. */
export function extractReleaseUrls(html, { base, handle }) {
  const prefix = `${base.replace(/\/$/, '')}/${handle}/`;
  const urls = new Set();
  const walk = value => {
    if (typeof value === 'string') {
      if (
        value.startsWith(prefix) &&
        !value.slice(prefix.length).includes('/')
      ) {
        const clean = value.split(/[?#]/)[0];
        if (clean.length > prefix.length) urls.add(clean);
      }
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object')
      Object.values(value).forEach(walk);
  };
  walk(parseJsonLd(html));
  return [...urls].sort();
}

/** Video ids on a YouTube channel "videos" page (first page, newest first). */
export function extractVideoIds(html, limit = 30) {
  const ids = [];
  for (const m of String(html ?? '').matchAll(/"videoId":"([\w-]{11})"/g))
    if (!ids.includes(m[1])) ids.push(m[1]);
  return ids.slice(0, limit);
}

/** The creator-written description embedded in a YouTube watch page. */
export function extractShortDescription(html) {
  const m = /"shortDescription":("(?:[^"\\]|\\.)*")/.exec(String(html ?? ''));
  if (!m) return '';
  try {
    return JSON.parse(m[1]);
  } catch {
    return '';
  }
}

export function extractLinksFromText(text, { host = 'jov.ie', source }) {
  const hostRe = new RegExp(
    `https?://(?:www\\.)?${host.replace(/\./g, '\\.')}/[^\\s"'<>)\\]]+`,
    'gi'
  );
  return [...String(text ?? '').matchAll(hostRe)].map(raw => ({
    url: raw[0]
      .replace(/[.,;:!?]+$/, '')
      .replace(/^http:/, 'https:')
      .replace('//www.', '//'),
    source,
  }));
}

const words = s =>
  String(s)
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Title words a slug promises, ignoring a trailing -N disambiguator. */
export function slugTitleWords(slug) {
  return words(slug.replace(/-\d+$/, ''));
}

export function titleMatchesSlug(title, slug) {
  const t = ` ${words(title)} `;
  const parts = slugTitleWords(slug).split(' ').filter(Boolean);
  return (
    parts.length > 0 && parts.every(p => t.includes(` ${p} `) || t.includes(p))
  );
}

// ---------------------------------------------------------------------------
// Checks. Each returns { id, target, status, severity, summary, expected,
// actual, url, ... }. status: passed | failed | unverified.
// ---------------------------------------------------------------------------

const pass = (id, target, summary, extra = {}) => ({
  id,
  target,
  status: 'passed',
  summary,
  ...extra,
});
const fail = (id, target, severity, summary, expected, actual, extra = {}) => ({
  id,
  target,
  status: 'failed',
  severity,
  summary,
  expected,
  actual,
  ...extra,
});
const unverified = (id, target, summary, extra = {}) => ({
  id,
  target,
  status: 'unverified',
  summary,
  ...extra,
});

/** Invariant/regression-check proposal per defect class (filed with each issue). */
export const INVARIANT_PROPOSALS = {
  'inbound-link-resolves':
    'Invariant: every jov.ie URL a creator has published off-platform (YouTube/Instagram/bio links) resolves 200, is not a "Coming soon" shell, and lands on a page whose title matches the slug. Enforced by the production dogfood agent on every deploy; the fix PR should add a slug-history redirect (content_slug_redirects) and a slug-claim test so a renamed or collided slug never orphans a published URL.',
  'release-page-resolves':
    'Invariant: every release listed in the profile JSON-LD resolves 200 with a canonical equal to its own URL and is not a "Coming soon" shell.',
  'release-has-destinations':
    'Invariant: every public release page exposes at least one working streaming destination.',
  'profile-identity':
    'Invariant: the public profile JSON-LD sameAs carries the verified Spotify and Apple artist ids for the artist.',
  'profile-has-releases':
    'Invariant: a profile whose catalog is imported lists its releases in JSON-LD and on the page.',
  'surface-renders':
    'Invariant: each public marketing/auth surface returns 200 with its identifying content and no error shell.',
  'rendered-clean':
    'Invariant: rendered public pages produce no page errors, no same-origin 4xx/5xx, no broken images and no horizontal overflow at phone and desktop widths.',
  'destination-link-live':
    'Invariant: outbound destination links (DSPs/socials) return a non-error status; identity ids on the profile match the verified artist.',
  'sitemap-url-healthy':
    'Invariant: every URL in sitemap.xml returns 200, is indexable, and is self-canonical; a sitemap entry that 404s, redirects away or points at a noindex placeholder is a defect.',
  'share-image-resolves':
    'Invariant: every public profile and release page advertises an og:image that returns 200 with an image content type.',
  'profile-interactions':
    'Invariant: the public profile tabs (Home, Music, Events, About) change the view, and Get Updates opens an email capture, with no page errors.',
  'build-binding':
    'Invariant: /api/health/build-info exposes a full commitSha and deploymentId so every receipt binds to the exact deploy.',
};

/**
 * @param {object} env
 * @param {(url:string)=>Promise<{status:number,finalUrl:string,text:string,error?:string}>} env.probe
 */
export async function checkBuildBinding({ probe, base }) {
  const res = await probe(`${base}/api/health/build-info`);
  let body = null;
  try {
    body = JSON.parse(res.text);
  } catch {
    // handled below
  }
  const sha = body?.commitSha;
  const dep = body?.deploymentId;
  if (res.status === 200 && /^[0-9a-f]{40}$/i.test(sha ?? '') && dep) {
    return {
      binding: {
        commitSha: sha.toLowerCase(),
        deploymentId: dep,
        buildId: body.buildId ?? null,
        version: body.version ?? null,
      },
      check: pass(
        'build-binding',
        `${base}/api/health/build-info`,
        `serving ${sha.slice(0, 10)} (${dep})`
      ),
    };
  }
  return {
    binding: null,
    check: fail(
      'build-binding',
      `${base}/api/health/build-info`,
      'P1',
      'build-info does not identify the deployed build',
      '200 with 40-hex commitSha and deploymentId',
      `status ${res.status}${res.error ? ` ${res.error}` : ''}`,
      { url: `${base}/api/health/build-info` }
    ),
  };
}

export async function checkPublicSurfaces({ probe, base, surfaces }) {
  const rows = await mapLimit(surfaces, PROBE_CONCURRENCY, async s => {
    const url = `${base}${s.path}`;
    return { s, url, res: await probe(url) };
  });
  const checks = [];
  for (const { s, url, res } of rows) {
    const id = 'surface-renders';
    if (res.error || res.status !== 200) {
      checks.push(
        fail(
          id,
          url,
          s.path === '/' || s.path === '/signup' || s.path === '/signin'
            ? 'P0'
            : 'P1',
          `${s.path} is not serving`,
          '200',
          `status ${res.status}${res.error ? ` (${res.error})` : ''}`,
          { url }
        )
      );
    } else if (
      s.mustInclude &&
      !res.text.toLowerCase().includes(s.mustInclude.toLowerCase())
    ) {
      checks.push(
        fail(
          id,
          url,
          'P1',
          `${s.path} is missing its identifying content`,
          `body includes "${s.mustInclude}"`,
          'content absent',
          { url }
        )
      );
    } else if (!s.path.includes('.') && hasErrorShell(pageTitle(res.text))) {
      checks.push(
        fail(
          id,
          url,
          'P1',
          `${s.path} renders an error shell`,
          'normal page',
          `title "${pageTitle(res.text)}"`,
          { url }
        )
      );
    } else {
      checks.push(pass(id, url, `${s.path} 200`));
    }
  }
  return checks;
}

export async function checkProfile({ probe, base, artist }) {
  const url = `${base}/${artist.handle}`;
  const res = await probe(url);
  const checks = [];
  if (res.error || res.status !== 200) {
    checks.push(
      fail(
        'profile-identity',
        url,
        'P0',
        'public profile is not serving',
        '200',
        `status ${res.status}${res.error ? ` (${res.error})` : ''}`,
        { url }
      )
    );
    return { checks, html: '', releaseUrls: [] };
  }
  const nodes = parseJsonLd(res.text);
  const blob = JSON.stringify(nodes);
  const hasSpotify = blob.includes(artist.spotifyArtistId);
  const hasApple = blob.includes(artist.appleArtistId);
  if (nodes.length === 0) {
    checks.push(
      fail(
        'profile-identity',
        url,
        'P1',
        'profile JSON-LD is missing or unparsable',
        'JSON-LD with sameAs',
        'no nodes parsed',
        { url }
      )
    );
  } else if (!hasSpotify || !hasApple) {
    checks.push(
      fail(
        'profile-identity',
        url,
        'P1',
        'profile sameAs lost a verified DSP identity',
        `Spotify ${artist.spotifyArtistId} and Apple ${artist.appleArtistId} in sameAs`,
        `spotify=${hasSpotify} apple=${hasApple}`,
        { url }
      )
    );
  } else {
    checks.push(
      pass(
        'profile-identity',
        url,
        'verified Spotify and Apple ids present in sameAs'
      )
    );
  }
  const releaseUrls = extractReleaseUrls(res.text, {
    base,
    handle: artist.handle,
  });
  if (releaseUrls.length === 0) {
    checks.push(
      fail(
        'profile-has-releases',
        url,
        'P1',
        'profile lists no releases',
        'releases in JSON-LD',
        '0 release URLs',
        { url }
      )
    );
  } else {
    checks.push(
      pass('profile-has-releases', url, `${releaseUrls.length} releases listed`)
    );
  }
  return { checks, html: res.text, releaseUrls };
}

/** Same-origin page that must be a real, self-canonical, non-placeholder page. */
function evaluateLanding({ id, requestedUrl, res, base, severity, context }) {
  const slug = new URL(requestedUrl).pathname.split('/').filter(Boolean).pop();
  if (res.error)
    return fail(
      id,
      requestedUrl,
      severity,
      `${context} could not be fetched`,
      '200 release page',
      res.error,
      { url: requestedUrl }
    );
  if (res.status !== 200)
    return fail(
      id,
      requestedUrl,
      severity,
      `${context} returns ${res.status}`,
      '200 release page',
      `HTTP ${res.status} (final ${res.finalUrl})`,
      { url: requestedUrl }
    );
  if (isComingSoon(res.text)) {
    return fail(
      id,
      requestedUrl,
      severity,
      `${context} lands on a "Coming soon" placeholder`,
      'the published release',
      `title "${pageTitle(res.text)}" (noindex=${isNoindex(res.text)})`,
      { url: requestedUrl }
    );
  }
  const finalSlug = new URL(res.finalUrl).pathname
    .split('/')
    .filter(Boolean)
    .pop();
  if (!titleMatchesSlug(pageTitle(res.text), finalSlug ?? slug)) {
    return fail(
      id,
      requestedUrl,
      'P2',
      `${context} lands on a page whose title does not match the slug`,
      `title containing "${slugTitleWords(finalSlug ?? slug)}"`,
      `title "${pageTitle(res.text)}" at ${res.finalUrl}`,
      { url: requestedUrl }
    );
  }
  if (id === 'release-page-resolves') {
    const canonical = canonicalOf(res.text);
    const want = `${base.replace(/\/$/, '')}${new URL(res.finalUrl).pathname}`;
    if (canonical && canonical !== want) {
      return fail(
        id,
        requestedUrl,
        'P2',
        `${context} canonical differs from its own URL`,
        want,
        canonical,
        { url: requestedUrl }
      );
    }
  }
  const moved = res.finalUrl !== requestedUrl ? ` -> ${res.finalUrl}` : '';
  return pass(id, requestedUrl, `${context} ok${moved}`);
}

export async function checkReleasePages({ probe, base, releaseUrls }) {
  const checks = [];
  const fetched = await mapLimit(releaseUrls, PROBE_CONCURRENCY, async url => ({
    url,
    res: await probe(url),
  }));
  for (const { url, res } of fetched) {
    checks.push(
      evaluateLanding({
        id: 'release-page-resolves',
        requestedUrl: url,
        res,
        base,
        severity: 'P1',
        context: 'release page',
      })
    );
    if (res.status === 200 && !isComingSoon(res.text)) {
      const dsp = [
        ...res.text.matchAll(
          /href="(https?:\/\/(?:open\.spotify\.com|music\.apple\.com|itunes\.apple\.com|www\.youtube\.com|youtube\.com|music\.youtube\.com|soundcloud\.com|www\.deezer\.com|tidal\.com|www\.amazon\.com|music\.amazon\.com)[^"]*)"/gi
        ),
      ].map(m => decodeEntities(m[1]));
      if (dsp.length === 0) {
        checks.push(
          fail(
            'release-has-destinations',
            url,
            'P1',
            'release page exposes no streaming destination',
            'at least one DSP link',
            'none found in page HTML',
            { url }
          )
        );
      } else {
        checks.push(
          pass(
            'release-has-destinations',
            url,
            `${dsp.length} destination link(s)`,
            { destinations: dsp.slice(0, 8) }
          )
        );
      }
    }
  }
  return checks;
}

export async function checkPublishedLinks({ probe, base, links }) {
  const checks = [];
  const unique = [...new Map(links.map(l => [l.url, l])).values()];
  const fetched = await mapLimit(unique, PROBE_CONCURRENCY, async link => ({
    link,
    res: await probe(link.url),
  }));
  for (const { link, res } of fetched) {
    const parsed = new URL(link.url);
    const isRoot =
      parsed.pathname.replace(/\/$/, '') === '' ||
      parsed.pathname.split('/').filter(Boolean).length < 2;
    if (isRoot) {
      checks.push(
        res.status === 200
          ? pass('inbound-link-resolves', link.url, 'profile/root link 200')
          : fail(
              'inbound-link-resolves',
              link.url,
              'P1',
              'published profile link does not resolve',
              '200',
              `HTTP ${res.status}`,
              { url: link.url, source: link.source }
            )
      );
      continue;
    }
    const verdict = evaluateLanding({
      id: 'inbound-link-resolves',
      requestedUrl: link.url,
      res,
      base,
      severity: 'P1',
      context: 'published link',
    });
    checks.push({ ...verdict, source: link.source });
  }
  return checks;
}

/** Every sitemap URL must be a healthy, indexable, self-canonical page. */
export async function checkSitemap({ probe, base }) {
  const sitemapUrl = `${base}/sitemap.xml`;
  const res = await probe(sitemapUrl);
  if (res.status !== 200) {
    return [
      fail(
        'sitemap-url-healthy',
        sitemapUrl,
        'P1',
        'sitemap.xml is not serving',
        '200',
        `HTTP ${res.status}`,
        { url: sitemapUrl }
      ),
    ];
  }
  const urls = [...res.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m =>
    decodeEntities(m[1]).trim()
  );
  if (urls.length === 0)
    return [
      fail(
        'sitemap-url-healthy',
        sitemapUrl,
        'P1',
        'sitemap.xml lists no URLs',
        'URLs',
        'none',
        { url: sitemapUrl }
      ),
    ];
  const fetched = await mapLimit(urls, PROBE_CONCURRENCY, async url => ({
    url,
    res: await probe(url),
  }));
  return fetched.map(({ url, res: r }) => {
    const id = 'sitemap-url-healthy';
    if (r.error || r.status !== 200)
      return fail(
        id,
        url,
        'P1',
        'sitemap URL does not return 200',
        '200',
        `HTTP ${r.status}${r.error ? ` (${r.error})` : ''}`,
        { url }
      );
    if (isComingSoon(r.text) || isNoindex(r.text))
      return fail(
        id,
        url,
        'P2',
        'sitemap lists a noindex or placeholder page',
        'an indexable page',
        `title "${pageTitle(r.text)}" noindex=${isNoindex(r.text)}`,
        { url }
      );
    const canonical = canonicalOf(r.text);
    const want = url.replace(/\/$/, '');
    if (canonical && canonical.replace(/\/$/, '') !== want)
      return fail(
        id,
        url,
        'P3',
        'sitemap URL is not self-canonical',
        want,
        canonical,
        { url }
      );
    return pass(id, url, 'healthy');
  });
}

/** og:image must resolve to an image for the profile and every release. */
export async function checkShareImages({ probe, urls }) {
  const rows = await mapLimit(urls, PROBE_CONCURRENCY, async url => {
    const page = await probe(url);
    const metas = [
      ...page.text.matchAll(
        /<meta[^>]+(?:property="og:image"|name="twitter:image")[^>]*>/gi
      ),
    ].map(m => m[0]);
    const image = metas
      .map(m => /content="([^"]*)"/.exec(m)?.[1])
      .find(Boolean);
    if (!image) return { url, image: null };
    const abs = new URL(decodeEntities(image), url).toString();
    return { url, image: abs, res: await probe(abs) };
  });
  return rows.map(({ url, image, res }) => {
    const id = 'share-image-resolves';
    if (!image)
      return fail(
        id,
        url,
        'P2',
        'page advertises no og:image',
        'og:image meta',
        'absent',
        { url }
      );
    if (res.status !== 200 || !/^image\//i.test(res.contentType ?? ''))
      return fail(
        id,
        url,
        'P2',
        'og:image does not resolve to an image',
        '200 image/*',
        `HTTP ${res.status} ${res.contentType ?? ''} ${image}`,
        { url }
      );
    return pass(id, url, 'og:image ok');
  });
}

const BOT_WALL = new Set([401, 403, 405, 429, 999]);

/** Outbound destination links: status only; walls are unverified, not failures. */
export async function checkDestinations({ probe, urls }) {
  const checks = [];
  const fetched = await mapLimit(urls, PROBE_CONCURRENCY, async url => ({
    url,
    res: await probe(url),
  }));
  for (const { url, res } of fetched) {
    if (res.error)
      checks.push(
        unverified('destination-link-live', url, `no response: ${res.error}`, {
          url,
        })
      );
    else if (res.status >= 200 && res.status < 400)
      checks.push(pass('destination-link-live', url, `HTTP ${res.status}`));
    else if (BOT_WALL.has(res.status))
      checks.push(
        unverified(
          'destination-link-live',
          url,
          `HTTP ${res.status} (bot wall; identity not provable from status)`,
          { url }
        )
      );
    else
      checks.push(
        fail(
          'destination-link-live',
          url,
          'P2',
          'outbound destination is dead',
          '2xx/3xx',
          `HTTP ${res.status}`,
          { url }
        )
      );
  }
  return checks;
}

export function sameAsUrls(html) {
  const urls = new Set();
  for (const node of parseJsonLd(html)) {
    for (const v of [].concat(node?.sameAs ?? []))
      if (typeof v === 'string' && /^https?:/.test(v)) urls.add(v);
  }
  return [...urls].sort();
}

// ---------------------------------------------------------------------------
// Missions, receipts, certification roll-up
// ---------------------------------------------------------------------------

/**
 * The mission registry. `automation: 'implemented'` missions run on every
 * pass; `blocked` missions are listed so uncertified features stay visible
 * with an owner and an unblock condition instead of vanishing.
 */
export const MISSIONS = [
  {
    id: 'dogfood:public-profile',
    subjectId: 'public-profile',
    product: 'jov',
    title:
      'Fan opens an artist profile and sees verified identity and releases',
    checks: ['profile-identity', 'profile-has-releases', 'build-binding'],
    automation: 'implemented',
  },
  {
    id: 'dogfood:release-landing',
    subjectId: 'release-landing',
    product: 'jov',
    title:
      'Fan opens every release page and reaches a working streaming destination',
    checks: [
      'release-page-resolves',
      'release-has-destinations',
      'destination-link-live',
      'share-image-resolves',
    ],
    automation: 'implemented',
  },
  {
    id: 'dogfood:published-links',
    subjectId: 'journey:artist-profile-public',
    product: 'jov',
    title:
      'A link the artist published off-platform lands on the right release',
    checks: ['inbound-link-resolves'],
    automation: 'implemented',
  },
  {
    id: 'dogfood:public-surfaces',
    subjectId: 'homepage',
    product: 'jov',
    title:
      'Visitor reaches the homepage, pricing, sign-in, sign-up and crawl files',
    checks: ['surface-renders'],
    automation: 'implemented',
  },
  {
    id: 'dogfood:sitemap-integrity',
    subjectId: 'homepage',
    product: 'jov',
    title: 'Every URL the sitemap advertises is a healthy, indexable page',
    checks: ['sitemap-url-healthy'],
    automation: 'implemented',
  },
  {
    id: 'dogfood:profile-interactions',
    subjectId: 'public-profile',
    product: 'jov',
    title: 'Fan switches profile tabs and opens Get Updates without errors',
    checks: ['profile-interactions'],
    automation: 'implemented',
  },
  {
    id: 'dogfood:rendered-public-ui',
    subjectId: 'journey:artist-profile-public',
    product: 'jov',
    title:
      'Profile and release pages render cleanly at phone and desktop widths',
    checks: ['rendered-clean'],
    automation: 'implemented',
  },
  {
    id: 'dogfood:signup-onboarding',
    subjectId: 'journey:signup-onboarding',
    product: 'jov',
    title: 'New artist signs up, claims a handle and reaches a live profile',
    checks: [],
    automation: 'blocked',
    blocker:
      'JOV-8809: no sanctioned production auth path for the onboarding robot',
    owner: 'auth lane',
  },
  {
    id: 'dogfood:dashboard',
    subjectId: 'dashboard-releases',
    product: 'jov',
    title: 'Artist opens the dashboard and sees real releases and audience',
    checks: [],
    automation: 'blocked',
    blocker:
      'needs an authorized production test artist session (read-only fixture)',
    owner: 'dogfood fixtures',
  },
  {
    id: 'dogfood:chat',
    subjectId: 'journey:chat-agent-turn',
    product: 'jov',
    title: 'Artist gets a correct chat answer grounded in their profile',
    checks: [],
    automation: 'blocked',
    blocker:
      'needs the same authorized test artist session; synthetic-chat-turn.spec.ts covers transport only',
    owner: 'chat lane',
  },
  {
    id: 'dogfood:fan-subscribe',
    subjectId: 'dashboard-audience',
    product: 'jov',
    title: 'Fan subscribes on a profile and the contact persists',
    checks: [],
    automation: 'blocked',
    blocker:
      'write path: needs a synthetic-audience marker fixture and cleanup (scripts synthetic-audience-markers.ts) on a non-Tim profile',
    owner: 'audience lane',
  },
  {
    id: 'dogfood:ovie-admin',
    subjectId: 'ovie-admin',
    product: 'ovie',
    title:
      'Founder opens the Ovie admin views and each shows current, internally consistent data',
    checks: [],
    automation: 'blocked',
    blocker: 'needs an authorized read-only Ovie admin session',
    owner: 'ovie stream',
  },
  {
    id: 'dogfood:lyb-core',
    subjectId: 'lyb-core-flows',
    product: 'lyb',
    title: 'LogYourBody user logs a weigh-in and sees it in the timeline',
    checks: [],
    automation: 'blocked',
    blocker: 'needs a LYB production test account and a web/iOS driver',
    owner: 'lyb lane',
  },
];

function outcomeOf(checks, mission) {
  if (mission.automation === 'blocked') return 'blocked';
  if (checks.length === 0) return 'blocked';
  if (checks.some(c => c.status === 'failed')) return 'failed';
  if (
    checks.some(
      c => c.status === 'unverified' && c.id !== 'destination-link-live'
    )
  )
    return 'blocked';
  return 'passed';
}

/**
 * One `jovie.dogfood-receipt/v1` per mission run, bound to the deployed
 * commit and deployment. The driver is Playwright (request context + browser).
 */
export function buildReceipt({
  mission,
  checks,
  binding,
  startedAt,
  completedAt,
  evidenceRefs,
  actor = 'prod-dogfood-agent',
  flagCohort = 'public',
}) {
  const outcome = outcomeOf(checks, mission);
  const failed = checks.filter(c => c.status === 'failed');
  let blocker = null;
  if (mission.automation === 'blocked') blocker = mission.blocker;
  else if (outcome === 'failed')
    blocker = `${failed.length} failed check(s): ${[...new Set(failed.map(c => c.id))].join(', ')}`;
  else if (outcome === 'blocked') blocker = 'a required check was unverified';
  return {
    schema: RECEIPT_SCHEMA,
    subjectId: mission.subjectId,
    product: mission.product,
    kind: 'ui_agent',
    driver: 'playwright',
    missionId: mission.id,
    actor,
    environment: 'production',
    deploymentId: binding.deploymentId,
    commitSha: binding.commitSha,
    flagCohort,
    startedAt,
    completedAt,
    outcome,
    blocker,
    evidenceRefs: evidenceRefs?.length
      ? evidenceRefs
      : [`checks:${mission.id}`],
    invocation: null,
    privacy: {
      conversationContentRetained: false,
      credentialsRetained: false,
      accountIdentityRetained: false,
      unrelatedPersonalDataRetained: false,
    },
  };
}

/**
 * Certification roll-up. A mission is `certified` only on a passed receipt
 * whose commit equals the deploy still being served (`servedSha`).
 */
export function certificationState({
  receipts,
  servedSha,
  generatedAt,
  previous = {},
}) {
  const missions = MISSIONS.map(m => {
    const r = receipts.find(x => x.missionId === m.id);
    const prev = previous[m.id] ?? null;
    let status;
    if (!r || m.automation === 'blocked') status = 'uncertified:blocked';
    else if (r.outcome === 'passed' && r.commitSha === servedSha)
      status = 'certified';
    else if (r.outcome === 'passed') status = 'uncertified:stale-sha';
    else if (r.outcome === 'failed') status = 'failing';
    else status = 'uncertified:blocked';
    return {
      missionId: m.id,
      subjectId: m.subjectId,
      product: m.product,
      title: m.title,
      status,
      commitSha: r?.commitSha ?? null,
      deploymentId: r?.deploymentId ?? null,
      completedAt: r?.completedAt ?? null,
      blocker:
        status === 'certified' ? null : (r?.blocker ?? m.blocker ?? null),
      owner: m.owner ?? null,
      lastCertifiedSha:
        status === 'certified' ? r.commitSha : (prev?.lastCertifiedSha ?? null),
    };
  });
  return {
    schema: CERTIFICATION_SCHEMA,
    generatedAt,
    servedSha,
    certified: missions.filter(m => m.status === 'certified').length,
    total: missions.length,
    missions,
  };
}

const NEXT_STEP = {
  'inbound-link-resolves':
    'Fix the slug resolution (redirect/alias for the published slug) so the URL the artist already published lands on the correct release.',
  'release-page-resolves':
    'Restore or republish the release page; check the release row status and slug.',
  'surface-renders':
    'Restore the surface; check the latest deploy and error logs.',
};

/** Linear issue body for one failed check: evidence, expectation, owner, invariant. */
export function findingIssue({
  check,
  mission,
  binding,
  runUrl,
  artifactNote,
}) {
  const fp = fingerprintFor({
    mission: mission.id,
    check: check.id,
    target: check.target,
  });
  const sev = SEVERITY[check.severity] ?? SEVERITY.P2;
  const lines = [
    '## Found by the production dogfood agent (before a human did)',
    '',
    `- Mission: ${mission.id} (${mission.title})`,
    `- Severity: ${sev.label}`,
    `- URL: ${check.url ?? check.target}`,
    ...(check.source ? [`- Published at: ${check.source}`] : []),
    `- Served build: ${binding.commitSha} (${binding.deploymentId})`,
    `- Run: ${runUrl || 'local run'}`,
    ...(artifactNote ? [`- Evidence: ${artifactNote}`] : []),
    '',
    '## Expected',
    check.expected ?? '',
    '',
    '## Actual',
    check.actual ?? check.summary,
    '',
    '## Next step',
    NEXT_STEP[check.id] ??
      'Reproduce with the URL above, fix on the normal path.',
    '',
    '## Invariant / regression check to add with the fix',
    INVARIANT_PROPOSALS[check.id] ??
      'Add a deterministic production check for this defect class to the dogfood agent.',
    '',
    'This issue closes itself when the dogfood agent next verifies the check passing on production.',
    '',
    `Fingerprint: ${fp}`,
  ];
  return {
    fingerprint: fp,
    title: `[${fp}] ${check.summary} (${(() => {
      try {
        return new URL(check.url ?? check.target).pathname;
      } catch {
        return check.target;
      }
    })()})`,
    description: lines.join('\n'),
    priority: sev.priority,
  };
}

/** Weekly Tim-found vs agent-found counts from {createdAt, labels[]} rows. */
export function weeklyDefectMetrics(
  issues,
  { now = new Date(), weeks = 5 } = {}
) {
  const startOfWeek = d => {
    const x = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    );
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x.toISOString().slice(0, 10);
  };
  const rows = new Map();
  for (let i = 0; i < weeks; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    rows.set(startOfWeek(d), {
      week: startOfWeek(d),
      agentFound: 0,
      timFound: 0,
    });
  }
  for (const issue of issues) {
    const week = startOfWeek(new Date(issue.createdAt));
    const row = rows.get(week);
    if (!row) continue;
    const labels = issue.labels ?? [];
    if (labels.includes('dogfood-agent')) row.agentFound++;
    else if (labels.includes('escaped-defect')) row.timFound++;
  }
  return [...rows.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .map(r => ({
      ...r,
      agentShare:
        r.agentFound + r.timFound === 0
          ? null
          : Number((r.agentFound / (r.agentFound + r.timFound)).toFixed(2)),
    }));
}
