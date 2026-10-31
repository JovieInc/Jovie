#!/usr/bin/env node
/**
 * Catalog completeness invariant (public data only, no credentials).
 *
 *  1. Every release a DSP lists for the artist (Apple Music, matched by
 *     normalized title + release year) has a page on the public Jovie profile.
 *  2. Every jov.ie release link in the artist's YouTube video descriptions
 *     resolves to a live release page (HTTP 200, not "Coming soon").
 *
 * Usage:
 *   node scripts/catalog-completeness/check.mjs --handle tim --apple 859547284 \
 *     [--youtube-channel UC...] [--origin https://jov.ie] [--json]
 *
 * Exit 0 when complete, 1 when findings exist, 2 on usage or fetch errors.
 */

const VERSION_SUFFIX = /\s+-\s+(single|ep|album)\s*$/i;

/** Comparable release title: no edition suffix, feat. clause or punctuation. */
export function normalizeCatalogTitle(raw) {
  return String(raw ?? '')
    .normalize('NFKD')
    .replace(VERSION_SUFFIX, '')
    .replace(/[([]\s*(feat|ft|featuring)\.?[^)\]]*[)\]]/gi, ' ')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

export function releaseKey(title, date) {
  return `${normalizeCatalogTitle(title)}|${String(date).slice(0, 4)}`;
}

/** Releases embedded in the public profile page (title, slug, release date). */
export function parseJovieProfileReleases(html) {
  const text = html.replaceAll('\\"', '"');
  const out = [];
  const pattern =
    /"title":"([^"\\]*)","slug":"([^"\\]*)"[^}]{0,400}?"releaseDate":"(\d{4}-\d{2}-\d{2})/g;
  for (const m of text.matchAll(pattern)) {
    out.push({ title: m[1], slug: m[2], date: m[3] });
  }
  return out;
}

/** Albums from an iTunes lookup response (entity=album), primary or collab. */
export function parseAppleAlbums(json) {
  return (json.results ?? [])
    .filter(r => r.wrapperType === 'collection' && r.collectionName)
    .map(r => ({
      title: r.collectionName,
      date: String(r.releaseDate).slice(0, 10),
      artist: r.artistName,
      id: r.collectionId,
    }));
}

/** DSP releases with no Jovie release of the same title and year. */
export function diffCatalog(jovieReleases, dspAlbums) {
  const have = new Set(jovieReleases.map(r => releaseKey(r.title, r.date)));
  const seen = new Set();
  const missing = [];
  for (const album of dspAlbums) {
    const key = releaseKey(album.title, album.date);
    if (have.has(key) || seen.has(key)) continue;
    seen.add(key);
    missing.push(album);
  }
  return missing;
}

/** jov.ie release links (handle/slug) inside free text. */
export function extractReleaseLinks(text, handle, origin = 'https://jov.ie') {
  const host = new URL(origin).host.replaceAll('.', '\\.');
  const re = new RegExp(
    `https?://${host}/${handle}/([a-z0-9][a-z0-9-]*)`,
    'gi'
  );
  return [...new Set([...String(text ?? '').matchAll(re)].map(m => m[1]))];
}

/** Classify a fetched release page. */
export function classifyReleasePage({ status, html }) {
  if (status === 404) return 'not_found';
  if (status >= 400) return `http_${status}`;
  if (/<title>[^<]*coming soon/i.test(html ?? '')) return 'coming_soon';
  return 'live';
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function getText(url) {
  const res = await fetch(url, { redirect: 'follow' });
  return { status: res.status, html: await res.text() };
}

async function youtubeDescriptions(channelId) {
  const { html } = await getText(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
  );
  const entries = [...html.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
  if (entries.length === 0) {
    throw new Error(
      'YouTube feed returned no entries (transient error or empty channel)'
    );
  }
  return entries.map(m => ({
    id: /<yt:videoId>([^<]+)/.exec(m[1])?.[1],
    description: (
      /<media:description>([\s\S]*?)<\/media:description>/.exec(m[1])?.[1] ?? ''
    ).replaceAll('&amp;', '&'),
  }));
}

export async function run({ handle, apple, youtubeChannel, origin }) {
  const profile = await getText(`${origin}/${handle}`);
  if (profile.status !== 200)
    throw new Error(`profile ${handle}: HTTP ${profile.status}`);
  const jovie = parseJovieProfileReleases(profile.html);
  const report = {
    handle,
    jovieReleases: jovie.length,
    missingReleases: [],
    badVideoLinks: [],
  };

  if (apple) {
    const res = await fetch(
      `https://itunes.apple.com/lookup?id=${apple}&entity=album&limit=200&country=us`
    );
    const dsp = parseAppleAlbums(await res.json());
    report.dspReleases = dsp.length;
    report.missingReleases = diffCatalog(jovie, dsp);
  }

  if (youtubeChannel) {
    for (const video of await youtubeDescriptions(youtubeChannel)) {
      for (const slug of extractReleaseLinks(
        video.description,
        handle,
        origin
      )) {
        const state = classifyReleasePage(
          await getText(`${origin}/${handle}/${slug}`)
        );
        if (state !== 'live')
          report.badVideoLinks.push({ videoId: video.id, slug, state });
      }
    }
  }
  return report;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const handle = arg('handle');
  if (!handle) {
    console.error(
      'usage: check.mjs --handle <h> [--apple <id>] [--youtube-channel <UC..>]'
    );
    process.exit(2);
  }
  try {
    const report = await run({
      handle,
      apple: arg('apple'),
      youtubeChannel: arg('youtube-channel'),
      origin: arg('origin') ?? 'https://jov.ie',
    });
    console.log(JSON.stringify(report, null, 2));
    process.exit(
      report.missingReleases.length || report.badVideoLinks.length ? 1 : 0
    );
  } catch (error) {
    console.error(String(error));
    process.exit(2);
  }
}
