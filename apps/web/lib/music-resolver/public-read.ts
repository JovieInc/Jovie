import 'server-only';

import type { z } from 'zod';
import { type InHouseQuery, resolveInHouse } from './in-house';
import { createDefaultInHouseSources } from './in-house-sources';
import { musicResolveOutputSchema, musicResolveSchema } from './public-schemas';

export { musicResolveOutputSchema, musicResolveSchema } from './public-schemas';

export function musicResolveQuery(
  input: z.infer<typeof musicResolveSchema>
): InHouseQuery | null {
  const { kind, artist, territory } = input;
  const value = input.input;
  const market = territory?.toUpperCase();
  if (kind === 'artist' && (artist || territory)) return null;
  if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    if (url.username || url.password || url.port || url.protocol !== 'https:')
      return null;
    return kind === 'artist'
      ? { kind, url: url.href }
      : kind === 'track'
        ? { kind, url: url.href, territory: market }
        : { kind, url: url.href, territory: market };
  }
  // Reject URL-like inputs rather than searching credentials, schemes, or hosts as names.
  if (/^[a-z][a-z0-9+.-]*:|^[^\s]+\.[a-z]{2,}(?:\/|$)/i.test(value))
    return null;
  if (kind === 'artist') {
    return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
      ? { kind, mbid: value.toLowerCase() }
      : value.length <= 200
        ? { kind, name: value }
        : null;
  }
  const isrc = value.replace(/-/g, '').toUpperCase();
  if (kind === 'track' && /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc))
    return { kind, isrc, territory: market };
  if (kind === 'album' && /^\d{12,14}$/.test(value))
    return { kind, upc: value, territory: market };
  if (!artist) return null;
  return kind === 'track'
    ? { kind, artist, title: value, territory: market }
    : { kind, artist, title: value, territory: market };
}

export async function resolvePublicMusic(
  input: z.infer<typeof musicResolveSchema>,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const query = musicResolveQuery(input);
  if (!query) return { error: { code: 'INVALID_INPUT', retryable: false } };
  if (signal?.aborted)
    return { error: { code: 'CANCELLED', retryable: false } };
  const result = await resolveInHouse(
    query,
    createDefaultInHouseSources(signal)
  );
  if (signal?.aborted)
    return { error: { code: 'CANCELLED', retryable: false } };
  if (result.status === 'upstream_error')
    return { error: { code: 'UPSTREAM_FAILURE', retryable: true } };
  return musicResolveOutputSchema.parse(result);
}
