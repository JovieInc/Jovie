import 'server-only';

import {
  type CatalogTrack,
  type InHouseEntityKind,
  type InHouseQuery,
  type InHouseResolution,
  type InHouseSources,
  type ResolutionCandidate,
  type ResolvedDspLink,
} from './in-house-contracts';

export type {
  ArtistCandidate,
  CatalogAlbum,
  CatalogTrack,
  InHouseEntityKind,
  InHouseQuery,
  InHouseResolution,
  InHouseSources,
  ResolutionCandidate,
  ResolvedDspLink,
} from './in-house-contracts';
export { PROVENANCE_CONFIDENCE } from './in-house-contracts';

/**
 * Cross-DSP resolver (JOV-7323).
 *
 * Confidence follows the entity ladder: an identifier we were given, then an
 * exact ISRC/UPC hit on a DSP we already call, then a MusicBrainz url-rel,
 * then an exact artist-and-title match. A remix, live cut, or second MBID
 * stays ambiguous so a caller can ask for a choice instead of saving it.
 *
 * Sources are Spotify, Apple Music, Deezer, and MusicBrainz. A third-party
 * link aggregator is not called: its terms do not grant a backend we can
 * cache and republish.
 */

export function normalizeCatalogName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function sameCatalogName(left: string, right: string): boolean {
  return normalizeCatalogName(left) === normalizeCatalogName(right);
}

function territoryOf(query: { readonly territory?: string }): string {
  return query.territory ?? 'US';
}

function empty(
  kind: InHouseEntityKind,
  status: InHouseResolution['status'],
  candidateCount = 0
): InHouseResolution {
  return {
    status,
    kind,
    title: null,
    artist: null,
    isrc: null,
    upc: null,
    mbid: null,
    links: [],
    candidates: [],
    confidence: 0,
    provenance: {},
    candidateCount,
  };
}

function finish(
  kind: InHouseEntityKind,
  status: InHouseResolution['status'],
  entity: {
    readonly title: string | null;
    readonly artist: string | null;
    readonly isrc: string | null;
    readonly upc: string | null;
    readonly mbid: string | null;
  },
  links: readonly ResolvedDspLink[],
  candidates: readonly ResolutionCandidate[] = []
): InHouseResolution {
  const byProvider = new Map<string, ResolvedDspLink>();
  for (const link of links) {
    const current = byProvider.get(link.provider);
    if (!current || link.confidence > current.confidence) {
      byProvider.set(link.provider, link);
    }
  }
  const unique = [...byProvider.values()].sort((a, b) =>
    a.provider.localeCompare(b.provider)
  );
  const confidence = unique.reduce(
    (max, link) => Math.max(max, link.confidence),
    0
  );
  return {
    status: unique.length === 0 && status === 'resolved' ? 'no_match' : status,
    kind,
    title: entity.title,
    artist: entity.artist,
    isrc: entity.isrc,
    upc: entity.upc,
    mbid: entity.mbid,
    links: unique,
    candidates,
    confidence,
    provenance: Object.fromEntries(
      unique.map(link => [link.provider, link.provenance])
    ),
    candidateCount: Math.max(candidates.length, unique.length),
  };
}

function linksFromTracks(tracks: readonly CatalogTrack[]): ResolvedDspLink[] {
  return tracks.map(track => ({
    provider: track.provider,
    url: track.url,
    provenance: track.provenance,
    confidence: track.confidence,
  }));
}

async function fanOutIsrc(
  sources: InHouseSources,
  isrc: string,
  territory: string,
  seed: readonly ResolvedDspLink[]
): Promise<ResolvedDspLink[]> {
  const [tracks, rels] = await Promise.all([
    sources.trackByIsrc(isrc, territory),
    sources.urlRelsForIsrc(isrc),
  ]);
  return [...seed, ...linksFromTracks(tracks), ...rels];
}

async function resolveTrack(
  query: Extract<InHouseQuery, { kind: 'track' }>,
  sources: InHouseSources
): Promise<InHouseResolution> {
  const territory = territoryOf(query);
  if ('isrc' in query) {
    const [tracks, rels] = await Promise.all([
      sources.trackByIsrc(query.isrc, territory),
      sources.urlRelsForIsrc(query.isrc),
    ]);
    const first = tracks[0];
    return finish(
      'track',
      'resolved',
      {
        title: first?.title || null,
        artist: first?.artist || null,
        isrc: query.isrc,
        upc: first?.upc ?? null,
        mbid: null,
      },
      [...linksFromTracks(tracks), ...rels]
    );
  }
  if ('url' in query) {
    const direct = await sources.trackByUrl(query.url);
    if (!direct) return empty('track', 'no_match');
    const seed: ResolvedDspLink[] = [
      {
        provider: direct.provider,
        url: direct.url,
        provenance: direct.provenance,
        confidence: direct.confidence,
      },
    ];
    const links = direct.isrc
      ? await fanOutIsrc(sources, direct.isrc, territory, seed)
      : seed;
    return finish(
      'track',
      'resolved',
      {
        title: direct.title,
        artist: direct.artist,
        isrc: direct.isrc,
        upc: direct.upc,
        mbid: null,
      },
      links
    );
  }
  const hits = await sources.searchTracks(query.artist, query.title);
  const exact = hits.filter(
    hit =>
      sameCatalogName(hit.artist, query.artist) &&
      sameCatalogName(hit.title, query.title)
  );
  if (exact.length === 0) {
    const related = hits.filter(hit =>
      sameCatalogName(hit.artist, query.artist)
    );
    if (related.length === 0) return empty('track', 'no_match', hits.length);
    return finish(
      'track',
      'ambiguous',
      {
        title: query.title,
        artist: query.artist,
        isrc: null,
        upc: null,
        mbid: null,
      },
      [],
      related.map(hit => ({
        title: hit.title,
        artist: hit.artist,
        url: hit.url,
      }))
    );
  }
  const isrcs = new Set(
    exact.flatMap(hit => (hit.isrc ? [hit.isrc.toUpperCase()] : []))
  );
  if (isrcs.size > 1) {
    return finish(
      'track',
      'ambiguous',
      {
        title: query.title,
        artist: query.artist,
        isrc: null,
        upc: null,
        mbid: null,
      },
      [],
      exact.map(hit => ({
        title: hit.title,
        artist: hit.artist,
        url: hit.url,
      }))
    );
  }
  const isrc = [...isrcs][0] ?? null;
  const links = isrc
    ? await fanOutIsrc(sources, isrc, territory, linksFromTracks(exact))
    : linksFromTracks(exact);
  return finish(
    'track',
    'resolved',
    {
      title: exact[0]?.title ?? query.title,
      artist: exact[0]?.artist ?? query.artist,
      isrc,
      upc: exact.find(hit => hit.upc)?.upc ?? null,
      mbid: null,
    },
    links
  );
}

async function resolveAlbum(
  query: Extract<InHouseQuery, { kind: 'album' }>,
  sources: InHouseSources
): Promise<InHouseResolution> {
  if ('upc' in query) {
    const album = await sources.albumByUpc(query.upc);
    if (!album) return empty('album', 'no_match');
    return finish(
      'album',
      'resolved',
      {
        title: album.title,
        artist: album.artist,
        isrc: null,
        upc: album.upc ?? query.upc,
        mbid: null,
      },
      [
        {
          provider: album.provider,
          url: album.url,
          provenance: album.provenance,
          confidence: album.confidence,
        },
      ]
    );
  }
  if ('url' in query) {
    const album = await sources.albumByUrl(query.url);
    if (!album) return empty('album', 'no_match');
    return finish(
      'album',
      'resolved',
      {
        title: album.title,
        artist: album.artist,
        isrc: null,
        upc: album.upc,
        mbid: null,
      },
      [
        {
          provider: album.provider,
          url: album.url,
          provenance: album.provenance,
          confidence: album.confidence,
        },
      ]
    );
  }
  const hits = await sources.searchAlbums(query.artist, query.title);
  const exact = hits.filter(
    hit =>
      sameCatalogName(hit.artist, query.artist) &&
      sameCatalogName(hit.title, query.title)
  );
  if (exact.length === 0) {
    const related = hits.filter(hit =>
      sameCatalogName(hit.artist, query.artist)
    );
    if (related.length === 0) return empty('album', 'no_match', hits.length);
    return finish(
      'album',
      'ambiguous',
      {
        title: query.title,
        artist: query.artist,
        isrc: null,
        upc: null,
        mbid: null,
      },
      [],
      related.map(hit => ({
        title: hit.title,
        artist: hit.artist,
        url: hit.url,
      }))
    );
  }
  const upcs = new Set(exact.flatMap(hit => (hit.upc ? [hit.upc] : [])));
  if (upcs.size > 1) {
    return finish(
      'album',
      'ambiguous',
      {
        title: query.title,
        artist: query.artist,
        isrc: null,
        upc: null,
        mbid: null,
      },
      [],
      exact.map(hit => ({
        title: hit.title,
        artist: hit.artist,
        url: hit.url,
      }))
    );
  }
  return finish(
    'album',
    'resolved',
    {
      title: exact[0]?.title ?? query.title,
      artist: exact[0]?.artist ?? query.artist,
      isrc: null,
      upc: [...upcs][0] ?? null,
      mbid: null,
    },
    exact.map(hit => ({
      provider: hit.provider,
      url: hit.url,
      provenance: hit.provenance,
      confidence: hit.confidence,
    }))
  );
}

async function resolveArtist(
  query: Extract<InHouseQuery, { kind: 'artist' }>,
  sources: InHouseSources
): Promise<InHouseResolution> {
  if ('url' in query) {
    const artist = await sources.artistByUrl(query.url);
    if (!artist) return empty('artist', 'no_match');
    return finish(
      'artist',
      'resolved',
      {
        title: artist.name || null,
        artist: artist.name || null,
        isrc: null,
        upc: null,
        mbid: artist.mbid,
      },
      artist.links
    );
  }
  if ('mbid' in query) {
    const artist = await sources.artistByMbid(query.mbid);
    if (!artist) return empty('artist', 'no_match');
    return finish(
      'artist',
      'resolved',
      {
        title: artist.name,
        artist: artist.name,
        isrc: null,
        upc: null,
        mbid: artist.mbid ?? query.mbid,
      },
      artist.links
    );
  }
  const candidates = await sources.artistCandidates(query.name);
  const exact = candidates.filter(candidate =>
    sameCatalogName(candidate.name, query.name)
  );
  if (exact.length === 0) return empty('artist', 'no_match', candidates.length);
  const mbids = new Set(
    exact.flatMap(candidate => (candidate.mbid ? [candidate.mbid] : []))
  );
  if (mbids.size > 1) {
    return finish(
      'artist',
      'ambiguous',
      {
        title: query.name,
        artist: query.name,
        isrc: null,
        upc: null,
        mbid: null,
      },
      [],
      exact.map(candidate => ({
        title: candidate.name,
        artist: candidate.name,
        url: candidate.url,
      }))
    );
  }
  return finish(
    'artist',
    'resolved',
    {
      title: exact[0]?.name ?? query.name,
      artist: exact[0]?.name ?? query.name,
      isrc: null,
      upc: null,
      mbid: [...mbids][0] ?? null,
    },
    exact.flatMap(candidate => candidate.links)
  );
}

async function loadDefaultSources(): Promise<InHouseSources> {
  const { createDefaultInHouseSources } = await import('./in-house-sources');
  return createDefaultInHouseSources();
}

export async function resolveInHouse(
  query: InHouseQuery,
  sources?: InHouseSources
): Promise<InHouseResolution> {
  const kind = query.kind;
  try {
    const active = sources ?? (await loadDefaultSources());
    if (query.kind === 'track') return await resolveTrack(query, active);
    if (query.kind === 'album') return await resolveAlbum(query, active);
    return await resolveArtist(query, active);
  } catch {
    return empty(kind, 'upstream_error');
  }
}
