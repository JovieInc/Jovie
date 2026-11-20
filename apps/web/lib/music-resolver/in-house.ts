import 'server-only';

import { matchArtistCredits, sameCatalogName, sameUpc } from './catalog-names';
import {
  type ArtistCandidate,
  type CatalogAlbum,
  type CatalogTrack,
  type InHouseEntityKind,
  type InHouseQuery,
  type InHouseResolution,
  type InHouseSources,
  type ResolutionCandidate,
  type ResolvedArtistMetadata,
  type ResolvedDspLink,
} from './in-house-contracts';

export { normalizeCatalogName, sameCatalogName } from './catalog-names';
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
 * link aggregator is not called: its terms restrict use to build a competing
 * aggregation service.
 */

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
    readonly artistMetadata?: ResolvedArtistMetadata;
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
    status:
      unique.length === 0 &&
      status === 'resolved' &&
      !(kind === 'artist' && entity.mbid)
        ? 'no_match'
        : status,
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
    ...(entity.artistMetadata ? { artistMetadata: entity.artistMetadata } : {}),
  };
}

function linkFromCatalog(item: {
  readonly provider: string;
  readonly url: string;
  readonly provenance: string;
  readonly confidence: number;
}): ResolvedDspLink {
  return {
    provider: item.provider,
    url: item.url,
    provenance: item.provenance,
    confidence: item.confidence,
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
    const direct = await sources.trackByUrl(query.url, query.territory);
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
  const hits = await sources.searchTracks(query.artist, query.title, territory);
  const credited = hits.flatMap(hit => {
    const match = matchArtistCredits(query.artist, hit.artist, hit.artists);
    return match ? [{ hit, match }] : [];
  });
  const matched = credited.filter(({ hit }) =>
    sameCatalogName(hit.title, query.title)
  );
  const subject = {
    title: query.title,
    artist: query.artist,
    isrc: null,
    upc: null,
    mbid: null,
  };
  const candidatesOf = (items: readonly CatalogTrack[]) =>
    items.map(hit => ({ title: hit.title, artist: hit.artist, url: hit.url }));
  if (matched.length === 0) {
    if (credited.length === 0) return empty('track', 'no_match', hits.length);
    return finish(
      'track',
      'ambiguous',
      subject,
      [],
      candidatesOf(credited.map(item => item.hit))
    );
  }
  const exact = matched.map(item => item.hit);
  const isrcs = new Set(
    exact.flatMap(hit => (hit.isrc ? [hit.isrc.toUpperCase()] : []))
  );
  if (isrcs.size > 1) {
    return finish('track', 'ambiguous', subject, [], candidatesOf(exact));
  }
  const isrc = [...isrcs][0] ?? null;
  const links = isrc
    ? await fanOutIsrc(sources, isrc, territory, linksFromTracks(exact))
    : linksFromTracks(exact);
  // A collaborator-only credit is weaker than a full credit match: it needs an
  // ISRC that a second provider independently confirms.
  const creditOnly = matched.every(item => item.match === 'credit');
  if (
    creditOnly &&
    (!isrc || new Set(links.map(link => link.provider)).size < 2)
  ) {
    return finish('track', 'ambiguous', subject, [], candidatesOf(exact));
  }
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
    const found = sources.albumsByUpc
      ? await sources.albumsByUpc(query.upc, territoryOf(query))
      : [await sources.albumByUpc(query.upc, territoryOf(query))];
    // A source that reports a different UPC for the record never counts.
    const albums = found.filter(
      (album): album is CatalogAlbum =>
        album !== null && (!album.upc || sameUpc(album.upc, query.upc))
    );
    const first = albums[0];
    if (!first) return empty('album', 'no_match');
    return finish(
      'album',
      'resolved',
      {
        title: first.title,
        artist: first.artist,
        isrc: null,
        upc: first.upc ?? query.upc,
        mbid: null,
      },
      albums.map(linkFromCatalog)
    );
  }
  if ('url' in query) {
    const album = await sources.albumByUrl(query.url, query.territory);
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
  const hits = await sources.searchAlbums(
    query.artist,
    query.title,
    territoryOf(query)
  );
  const credited = hits.flatMap(hit => {
    const match = matchArtistCredits(query.artist, hit.artist, hit.artists);
    return match ? [{ hit, match }] : [];
  });
  const matched = credited.filter(({ hit }) =>
    sameCatalogName(hit.title, query.title)
  );
  const subject = {
    title: query.title,
    artist: query.artist,
    isrc: null,
    upc: null,
    mbid: null,
  };
  const candidatesOf = (items: readonly CatalogAlbum[]) =>
    items.map(hit => ({ title: hit.title, artist: hit.artist, url: hit.url }));
  if (matched.length === 0) {
    if (credited.length === 0) return empty('album', 'no_match', hits.length);
    return finish(
      'album',
      'ambiguous',
      subject,
      [],
      candidatesOf(credited.map(item => item.hit))
    );
  }
  const exact = matched.map(item => item.hit);
  const upcs = new Set(
    exact.flatMap(hit => (hit.upc ? [hit.upc.replace(/^0+/, '')] : []))
  );
  // Same-name artists with the same title surface as distinct releases:
  // different UPCs, or several URLs on one provider with no UPC to join them.
  const urlsByProvider = new Map<string, Set<string>>();
  for (const hit of exact) {
    const urls = urlsByProvider.get(hit.provider) ?? new Set<string>();
    urls.add(hit.url);
    urlsByProvider.set(hit.provider, urls);
  }
  const duplicateOnProvider = [...urlsByProvider.values()].some(
    urls => urls.size > 1
  );
  if (upcs.size > 1 || (duplicateOnProvider && upcs.size !== 1)) {
    return finish('album', 'ambiguous', subject, [], candidatesOf(exact));
  }
  const knownUpc = exact.find(hit => hit.upc)?.upc ?? null;
  // Identifier evidence: re-resolve by the shared UPC so a second provider
  // independently confirms the same release before any new-source link ships.
  const byUpc =
    knownUpc && sources.albumsByUpc
      ? (await sources.albumsByUpc(knownUpc, territoryOf(query))).filter(
          album => !album.upc || sameUpc(album.upc, knownUpc)
        )
      : [];
  const evidenced = [
    ...byUpc,
    ...exact.filter(hit => hit.upc && sameUpc(hit.upc, knownUpc)),
  ];
  const corroborated = new Set(evidenced.map(hit => hit.provider)).size >= 2;
  const creditOnly = matched.every(item => item.match === 'credit');
  if (creditOnly && !corroborated) {
    return finish('album', 'ambiguous', subject, [], candidatesOf(exact));
  }
  // Spotify and Deezer name hits need that corroboration. Apple search rows
  // predate it and keep the established exact-name path.
  const links = [
    ...(corroborated ? evidenced : []),
    ...exact.filter(hit => hit.provider === 'apple_music' || !hit.upc),
  ];
  return finish(
    'album',
    'resolved',
    {
      title: exact[0]?.title ?? query.title,
      artist: exact[0]?.artist ?? query.artist,
      isrc: null,
      upc: knownUpc,
      mbid: null,
    },
    links.map(linkFromCatalog)
  );
}

async function resolveArtist(
  query: Extract<InHouseQuery, { kind: 'artist' }>,
  sources: InHouseSources
): Promise<InHouseResolution> {
  if ('url' in query) {
    const candidates = await sources.artistByUrl(query.url);
    if (candidates.length > 1) return artistChoices(candidates, null);
    const artist = candidates[0];
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
        artistMetadata: artist.metadata,
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
        artistMetadata: artist.metadata,
      },
      artist.links
    );
  }
  const candidates = await sources.artistCandidates(query.name);
  const exact = candidates.filter(candidate =>
    sameCatalogName(candidate.name, query.name)
  );
  if (exact.length === 0) return empty('artist', 'no_match', candidates.length);
  const groups = new Map<string, ArtistCandidate[]>();
  for (const candidate of exact) {
    const linkedIdentity = candidate.mbid
      ? null
      : exact.find(
          known =>
            known.mbid &&
            known.links.some(
              link =>
                link.provenance === 'musicbrainz_url_rel' &&
                artistUrlIdentity(link.url) === artistUrlIdentity(candidate.url)
            )
        );
    const key =
      candidate.mbid ??
      linkedIdentity?.mbid ??
      artistUrlIdentity(candidate.url);
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  if (groups.size > 1)
    return artistChoices(
      [...groups.values()].map(group => group[0]),
      query.name
    );
  const known = exact.find(candidate => candidate.mbid);
  return finish(
    'artist',
    'resolved',
    {
      title: exact[0]?.name ?? query.name,
      artist: exact[0]?.name ?? query.name,
      isrc: null,
      upc: null,
      mbid: known?.mbid ?? null,
      artistMetadata: known?.metadata,
    },
    exact.flatMap(candidate => candidate.links)
  );
}

function artistChoices(
  candidates: readonly ArtistCandidate[],
  name: string | null
): InHouseResolution {
  return finish(
    'artist',
    'ambiguous',
    {
      title: name,
      artist: name,
      isrc: null,
      upc: null,
      mbid: null,
    },
    [],
    candidates.map(candidate => ({
      title: candidate.name,
      artist: candidate.name,
      url: candidate.url,
    }))
  );
}

/** Only provider artist identifiers prove equivalence; a matching name cannot. */
function artistUrlIdentity(value: string): string {
  try {
    const url = new URL(value);
    if (['itunes.apple.com', 'music.apple.com'].includes(url.hostname)) {
      const id = /^\/[a-z]{2}\/artist\/(?:[^/]+\/)?(?:id)?(\d+)\/?$/.exec(
        url.pathname
      )?.[1];
      if (id) return `apple_music:${id}`;
    }
    if (url.hostname === 'open.spotify.com') {
      const artistPath = url.pathname.replace(/^\/intl-([a-z]{2})\//, '/');
      const id = /^\/artist\/([A-Za-z0-9]{22})\/?$/.exec(artistPath)?.[1];
      if (id) return `spotify:${id}`;
    }
    if (url.hostname === 'www.deezer.com' || url.hostname === 'deezer.com') {
      const id = /^\/(?:[a-z]{2}\/)?artist\/(\d+)\/?$/.exec(url.pathname)?.[1];
      if (id) return `deezer:${id}`;
    }
    return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
  } catch {
    return value;
  }
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
