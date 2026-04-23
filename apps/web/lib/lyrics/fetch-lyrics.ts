/**
 * Lyrics enrichment — fetch plain-text lyrics for a recording at ingest time.
 *
 * Provider cascade:
 *   1. Musixmatch (track.search + track.lyrics.get) when MUSIXMATCH_API_KEY set
 *   2. Genius search API when GENIUS_ACCESS_TOKEN set (returns song URL only;
 *      actual lyrics body requires scraping and is handled by the Genius
 *      scraping step in a follow-up — for now the URL is logged and null is
 *      returned from this path)
 *
 * Returns null if no provider is configured or if all providers miss. Callers
 * should fall through to other lyric sources (existing lyrics column → AI hook).
 */

export interface FetchLyricsInput {
  title: string;
  artistName: string;
}

export interface FetchLyricsResult {
  lyrics: string;
  source: 'musixmatch' | 'genius';
}

export async function fetchLyrics(
  input: FetchLyricsInput
): Promise<FetchLyricsResult | null> {
  const musixmatchKey = process.env.MUSIXMATCH_API_KEY;
  if (musixmatchKey) {
    const fromMusixmatch = await fetchFromMusixmatch(input, musixmatchKey);
    if (fromMusixmatch) return { lyrics: fromMusixmatch, source: 'musixmatch' };
  }

  const geniusToken = process.env.GENIUS_ACCESS_TOKEN;
  if (geniusToken) {
    const fromGenius = await fetchFromGenius(input, geniusToken);
    if (fromGenius) return { lyrics: fromGenius, source: 'genius' };
  }

  return null;
}

async function fetchFromMusixmatch(
  { title, artistName }: FetchLyricsInput,
  apiKey: string
): Promise<string | null> {
  const searchUrl = new URL(
    'https://api.musixmatch.com/ws/1.1/matcher.lyrics.get'
  );
  searchUrl.searchParams.set('q_track', title);
  searchUrl.searchParams.set('q_artist', artistName);
  searchUrl.searchParams.set('apikey', apiKey);

  try {
    const res = await fetch(searchUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      message?: {
        header?: { status_code?: number };
        body?: { lyrics?: { lyrics_body?: string } };
      };
    };
    if (body.message?.header?.status_code !== 200) return null;
    const raw = body.message?.body?.lyrics?.lyrics_body?.trim();
    if (!raw) return null;
    // Musixmatch free tier appends a tracking footer — strip it.
    return raw.replace(/\*+.*$/s, '').trim() || null;
  } catch {
    return null;
  }
}

async function fetchFromGenius(
  { title, artistName }: FetchLyricsInput,
  accessToken: string
): Promise<string | null> {
  // Genius exposes search but not lyric bodies; we return null until a scraping
  // step lands. Kept as a gated no-op so the cascade shape is stable.
  try {
    const url = new URL('https://api.genius.com/search');
    url.searchParams.set('q', `${title} ${artistName}`);
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    // Future: follow result.url and scrape lyrics body. Intentionally noop.
    return null;
  } catch {
    return null;
  }
}
