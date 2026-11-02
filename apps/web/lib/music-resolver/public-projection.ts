import 'server-only';

import { DSP_REGISTRY, getRegistryEntry } from '@/lib/dsp-registry';
import type { InHouseResolution } from './in-house-contracts';
import {
  coreArtistMetadataSchema,
  musicResolveOutputSchema,
} from './public-schemas';

/** These are the existing resolver's core evidence kinds, not source resale grants. */
const CORE_LINK_PROVENANCE = new Set([
  'apple_music_isrc',
  'deezer_isrc',
  'exact_name',
  'input_url',
  'musicbrainz_url_rel',
  'spotify_isrc',
  'upc_exact',
]);

function coreUrl(value: string, provider?: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    return null;
  const entry = provider ? getRegistryEntry(provider) : undefined;
  const musicbrainz =
    provider === undefined &&
    url.hostname === 'musicbrainz.org' &&
    /^\/artist\/[0-9a-f-]+\/?$/i.test(url.pathname);
  const catalog =
    entry?.showOnListenPage && entry.domains.includes(url.hostname);
  // A provider label cannot disguise a social, private or arbitrary destination.
  if (!musicbrainz && !catalog) return null;
  // Preserve only Apple Music's track selector; query strings can carry credentials.
  const track = provider === 'apple_music' ? url.searchParams.get('i') : null;
  url.search = '';
  url.hash = '';
  if (track && /^\d+$/.test(track)) url.searchParams.set('i', track);
  return url.href;
}

/**
 * Every no-auth public transport receives this projection, including callers
 * carrying a cookie or key. A creator plan is not a data SKU. Expanded graph
 * access stays unavailable until canonical billing and source rights grant it.
 * Apply after resolution/cache joins; never serialize the enriched object.
 */
export function projectPublicMusic(result: InHouseResolution) {
  const links = result.links.flatMap(link => {
    const url = coreUrl(link.url, link.provider);
    return url && CORE_LINK_PROVENANCE.has(link.provenance)
      ? [
          {
            provider: link.provider,
            url,
            provenance: link.provenance,
            confidence: link.confidence,
          },
        ]
      : [];
  });
  const candidates = result.candidates.flatMap(candidate => {
    const catalogUrl =
      coreUrl(candidate.url) ?? getCatalogCandidateUrl(candidate.url);
    return catalogUrl
      ? [{ title: candidate.title, artist: candidate.artist, url: catalogUrl }]
      : [];
  });
  const metadata = result.artistMetadata;
  const sourceUrl = metadata && coreUrl(metadata.sourceUrl);
  const artistMetadata =
    metadata && sourceUrl
      ? coreArtistMetadataSchema.strip().parse({ ...metadata, sourceUrl })
      : undefined;

  return musicResolveOutputSchema.strip().parse({
    ...result,
    status:
      (result.status === 'resolved' &&
        links.length === 0 &&
        !(result.kind === 'artist' && result.mbid)) ||
      (result.status === 'ambiguous' && candidates.length === 0)
        ? 'no_match'
        : result.status,
    links,
    candidates,
    candidateCount: Math.max(candidates.length, links.length),
    confidence: links.reduce(
      (highest, link) => Math.max(highest, link.confidence),
      0
    ),
    // Rebuild rather than copying a map that may contain joined social facts.
    provenance: Object.fromEntries(
      links.map(link => [link.provider, link.provenance])
    ),
    artistMetadata,
  });
}

function getCatalogCandidateUrl(value: string): string | null {
  // Reuse the canonical provider registry rather than maintaining a host list.
  // Importing the registry here does not confer source use/redistribution rights.
  for (const entry of DSP_REGISTRY) {
    const url = coreUrl(value, entry.key);
    if (url) return url;
  }
  return null;
}
