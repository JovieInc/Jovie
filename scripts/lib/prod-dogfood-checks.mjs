// Production dogfood agent checks: pure extraction and check logic. No network
// or filesystem access here; callers inject `probe` (Playwright request
// context in scripts/prod-dogfood.mjs). Each check returns
// { id, target, status: passed|failed|unverified, severity, summary, ... }.

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
