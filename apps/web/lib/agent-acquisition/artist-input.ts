import { z } from 'zod';
import { extractSpotifyArtistId } from '@/lib/spotify/artist-id';

export const agentArtistInputSchema = z
  .object({
    input: z.string().trim().min(1).max(500),
    provider: z.enum(['spotify', 'apple_music']).optional(),
  })
  .strict();

export type ArtistProvider = 'spotify' | 'apple_music';
export type ParsedArtistInput =
  | { kind: 'exact'; provider: ArtistProvider; id: string; storefront?: string }
  | { kind: 'search'; provider: ArtistProvider; query: string }
  | { kind: 'invalid'; code: 'INVALID_INPUT' | 'UNSUPPORTED_INPUT' };

function exact(
  provider: ArtistProvider,
  id: string,
  requested?: ArtistProvider,
  storefront?: string
): ParsedArtistInput {
  if (requested && requested !== provider) {
    return { kind: 'invalid', code: 'INVALID_INPUT' };
  }
  const valid =
    provider === 'spotify'
      ? extractSpotifyArtistId(id) === id
      : /^[1-9]\d{0,19}$/.test(id);
  return valid
    ? { kind: 'exact', provider, id, ...(storefront ? { storefront } : {}) }
    : { kind: 'invalid', code: 'INVALID_INPUT' };
}

/** Resolve only explicit provider identities. Name search never selects an artist. */
export function parseAgentArtistInput(value: unknown): ParsedArtistInput {
  const parsed = agentArtistInputSchema.safeParse(value);
  if (!parsed.success) return { kind: 'invalid', code: 'INVALID_INPUT' };
  const { input, provider } = parsed.data;
  const namespace = /^(spotify|apple_music):(?:artist:)?(.+)$/.exec(input);
  if (namespace) {
    return exact(namespace[1] as ArtistProvider, namespace[2]!, provider);
  }
  if (extractSpotifyArtistId(input) === input) {
    return exact('spotify', input, provider);
  }
  if (provider === 'apple_music' && /^\d+$/.test(input)) {
    return exact('apple_music', input, provider);
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(input) || input.startsWith('//')) {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return { kind: 'invalid', code: 'INVALID_INPUT' };
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) {
      return { kind: 'invalid', code: 'UNSUPPORTED_INPUT' };
    }
    if (url.hostname === 'open.spotify.com') {
      // Normalize the optional locale before validating the artist resource.
      const pathname = url.pathname.replace(/^\/intl-([a-z]{2})\//, '/');
      const match = /^\/artist\/([A-Za-z0-9]{22})\/?$/.exec(pathname);
      return match
        ? exact('spotify', match[1]!, provider)
        : { kind: 'invalid', code: 'UNSUPPORTED_INPUT' };
    }
    if (url.hostname === 'music.apple.com') {
      const match =
        /^\/([a-z]{2})\/artist\/(?:[^/]+\/)?([1-9]\d{0,19})\/?$/.exec(
          url.pathname
        );
      return match
        ? exact('apple_music', match[2]!, provider, match[1])
        : { kind: 'invalid', code: 'UNSUPPORTED_INPUT' };
    }
    return { kind: 'invalid', code: 'UNSUPPORTED_INPUT' };
  }
  // URL-like input is not a name: never turn an unsupported URL into a search.
  if (
    input.startsWith('/') ||
    /(?:^www\.|\.[a-z]{2,}\/)/i.test(input) ||
    /[\u0000-\u001f\u007f]/.test(input) ||
    input.length > 60
  ) {
    return { kind: 'invalid', code: 'INVALID_INPUT' };
  }
  return { kind: 'search', provider: provider ?? 'spotify', query: input };
}
