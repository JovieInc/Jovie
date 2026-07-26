const STARTER_PROMPT_MAX_CHARS = 140;
const ARTIST_NAME_MAX_CHARS = 80;
const SPOTIFY_ARTIST_ID_PATTERN = /^[A-Za-z0-9]{22}$/;

export interface StartEntryHandoff {
  readonly kind: 'prompt' | 'spotify_artist';
  readonly prompt: string;
  readonly artistName?: string;
  readonly spotifyUrl?: string;
}

type StartEntrySearchParams = Readonly<
  Record<string, string | string[] | undefined>
>;

function readSingleParam(
  params: StartEntrySearchParams,
  key: string
): string | undefined {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

function sanitizeText(value: string, maxChars: number): string {
  return value
    .replaceAll(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxChars);
}

function sanitizeSpotifyArtistUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidate = trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'open.spotify.com' ||
      parsed.port ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    if (
      segments.length !== 2 ||
      segments[0] !== 'artist' ||
      !SPOTIFY_ARTIST_ID_PATTERN.test(segments[1] ?? '')
    ) {
      return null;
    }

    return `https://open.spotify.com/artist/${segments[1]}`;
  } catch {
    return null;
  }
}

/**
 * Resolve the only URL-based handoff accepted by public `/start`.
 *
 * A sanitized `starter_prompt` is the explicit contract. Optional Spotify
 * context is retained only when it is a canonical public artist URL. Bare
 * `spotify_url`, `url`, and unrelated query strings never suppress the blank
 * entry state.
 */
export function resolveStartEntryHandoff(
  params: StartEntrySearchParams
): StartEntryHandoff | null {
  const rawPrompt = readSingleParam(params, 'starter_prompt');
  if (!rawPrompt) return null;

  const prompt = sanitizeText(rawPrompt, STARTER_PROMPT_MAX_CHARS);
  if (!prompt) return null;

  const rawSpotifyUrl = readSingleParam(params, 'spotify_url');
  const spotifyUrl = rawSpotifyUrl
    ? sanitizeSpotifyArtistUrl(rawSpotifyUrl)
    : null;

  if (!spotifyUrl) {
    return { kind: 'prompt', prompt };
  }

  const rawArtistName = readSingleParam(params, 'artist_name');
  const artistName = rawArtistName
    ? sanitizeText(rawArtistName, ARTIST_NAME_MAX_CHARS)
    : '';

  return {
    kind: 'spotify_artist',
    prompt,
    spotifyUrl,
    ...(artistName ? { artistName } : {}),
  };
}
