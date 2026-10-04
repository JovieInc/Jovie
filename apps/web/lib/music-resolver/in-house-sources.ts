import 'server-only';

import type {
  MusicBrainzArtist,
  MusicBrainzRelation,
} from '@/lib/dsp-enrichment/types';
import { getRegistryEntry, PROVIDER_DOMAINS } from '@/lib/dsp-registry';

import {
  type ArtistCandidate,
  type CatalogAlbum,
  type CatalogTrack,
  type InHouseSources,
  PROVENANCE_CONFIDENCE,
  type ResolvedArtistMetadata,
  type ResolvedDspLink,
} from './in-house-contracts';

/**
 * Official DSP and MusicBrainz calls only. A third-party link aggregator
 * is omitted: its terms do not allow us to cache and republish matches.
 */

const TIMEOUT_MS = 8_000;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function httpsUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol === 'http:') url.protocol = 'https:';
    if (url.protocol !== 'https:' || url.username || url.password || url.port) {
      return null;
    }
    if (url.hostname === 'itunes.apple.com') {
      url.hostname = 'music.apple.com';
    }
    url.searchParams.delete('uo');
    url.searchParams.delete('at');
    url.searchParams.delete('app');
    return url.href;
  } catch {
    return null;
  }
}

function providerForListenUrl(value: string): string | null {
  let hostname: string;
  try {
    hostname = new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [provider, domains] of Object.entries(PROVIDER_DOMAINS)) {
    if (
      !domains.some(
        domain => hostname === domain || hostname.endsWith(`.${domain}`)
      )
    ) {
      continue;
    }
    if (getRegistryEntry(provider)?.showOnListenPage) return provider;
  }
  return null;
}

function providerForExternalUrl(value: string): string | null {
  const url = new URL(value);
  return (
    Object.entries(PROVIDER_DOMAINS).find(
      ([provider, domains]) =>
        (provider !== 'youtube_shorts' ||
          url.pathname.startsWith('/shorts/')) &&
        domains.some(
          domain =>
            url.hostname === domain || url.hostname.endsWith(`.${domain}`)
        )
    )?.[0] ?? null
  );
}

function artistFromMusicBrainz(artist: MusicBrainzArtist): ArtistCandidate {
  const links = linksFromRelations(artist.relations);
  const externalLinks: ResolvedArtistMetadata['externalLinks'] = (
    artist.relations ?? []
  ).flatMap(relation => {
    const url = relation.ended ? null : httpsUrl(relation.url?.resource);
    return url
      ? [
          {
            url,
            provider: providerForExternalUrl(url),
            relationship: relation.type,
            provenance: 'musicbrainz_url_rel' as const,
          },
        ]
      : [];
  });
  return {
    name: artist.name,
    mbid: artist.id,
    url: links[0]?.url ?? `https://musicbrainz.org/artist/${artist.id}`,
    links,
    metadata: {
      source: 'musicbrainz',
      sourceUrl: `https://musicbrainz.org/artist/${artist.id}`,
      disambiguation: artist.disambiguation ?? null,
      aliases: [
        ...new Set(
          (artist.aliases ?? []).map(alias => alias.name).filter(Boolean)
        ),
      ],
      type: artist.type ?? null,
      country: artist.country ?? null,
      area: artist.area?.name ?? null,
      origin: artist['begin-area']?.name ?? null,
      isnis: artist.isnis ?? [],
      ipis: artist.ipis ?? [],
      wikidataIds: externalLinks.flatMap(link => {
        const url = new URL(link.url);
        const id =
          url.hostname === 'www.wikidata.org' || url.hostname === 'wikidata.org'
            ? /^\/wiki\/(Q\d+)\/?$/.exec(url.pathname)?.[1]
            : null;
        return id ? [id] : [];
      }),
      externalLinks,
      releaseGroups: (artist['release-groups'] ?? []).map(group => ({
        mbid: group.id,
        title: group.title,
        primaryType: group['primary-type'] ?? null,
        firstReleaseDate: group['first-release-date'] ?? null,
      })),
      releaseGroupsComplete:
        artist['release-groups'] !== undefined &&
        artist['release-groups'].length < 25,
    },
  };
}

function isArtistUrl(href: string, provider: string | null): boolean {
  const url = new URL(href);
  if (provider === 'spotify')
    return /^\/(?:intl-[a-z]{2}\/)?artist\/[A-Za-z0-9]{22}\/?$/.test(
      url.pathname
    );
  if (provider === 'apple_music')
    return /^\/[a-z]{2}\/artist\/(?:[^/]+\/)?(?:id)?\d+\/?$/.test(url.pathname);
  if (provider === 'deezer')
    return /^\/(?:[a-z]{2}\/)?artist\/\d+\/?$/.test(url.pathname);
  return false;
}

function linkFromRelation(
  relation: MusicBrainzRelation
): ResolvedDspLink | null {
  if (relation.ended) return null;
  const resource = relation.url?.resource;
  if (!resource) return null;
  const href = httpsUrl(resource);
  const provider = href ? providerForListenUrl(href) : null;
  if (!href || !provider) return null;
  return {
    provider,
    url: href,
    provenance: 'musicbrainz_url_rel',
    confidence: PROVENANCE_CONFIDENCE.musicbrainz_url_rel,
  };
}

function linksFromRelations(
  relations: readonly MusicBrainzRelation[] | undefined
): ResolvedDspLink[] {
  return (relations ?? []).flatMap(relation => {
    const link = linkFromRelation(relation);
    return link ? [link] : [];
  });
}

async function readPublicJson(
  url: string,
  signal?: AbortSignal
): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      signal: signal
        ? AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), signal])
        : AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function appleTrack(row: Record<string, unknown>): CatalogTrack | null {
  const title = text(row.trackName);
  const artist = text(row.artistName);
  const href = httpsUrl(text(row.trackViewUrl));
  const provider = href ? providerForListenUrl(href) : null;
  if (!title || !artist || !href || !provider) return null;
  return {
    provider,
    title,
    artist,
    url: href,
    isrc: text(row.isrc)?.toUpperCase() ?? null,
    upc: null,
    provenance: 'apple_music_isrc',
    confidence: PROVENANCE_CONFIDENCE.isrc_exact,
  };
}

function appleAlbum(row: Record<string, unknown>): CatalogAlbum | null {
  const title = text(row.collectionName);
  const artist = text(row.artistName);
  const href = httpsUrl(text(row.collectionViewUrl));
  const provider = href ? providerForListenUrl(href) : null;
  if (!title || !artist || !href || !provider) return null;
  return {
    provider,
    title,
    artist,
    url: href,
    upc: null,
    provenance: 'upc_exact',
    confidence: PROVENANCE_CONFIDENCE.upc_exact,
  };
}

function rows(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];
  const results = (payload as { results?: unknown }).results;
  return Array.isArray(results)
    ? results.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === 'object'
      )
    : [];
}

async function readAppleLookup(
  params: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>[]> {
  const payload = await readPublicJson(
    `https://itunes.apple.com/lookup?${params}`,
    signal
  );
  return rows(payload);
}

export function createDefaultInHouseSources(
  signal?: AbortSignal
): InHouseSources {
  const readJson = (url: string) => readPublicJson(url, signal);
  const appleLookup = (params: string) => readAppleLookup(params, signal);
  return {
    async trackByIsrc(isrc, territory) {
      const {
        lookupAppleMusicByIsrc,
        lookupDeezerByIsrc,
        lookupSpotifyByIsrc,
      } = await import('@/lib/discography/provider-links');
      const [apple, deezer, spotify] = await Promise.all([
        lookupAppleMusicByIsrc(isrc, { storefront: territory.toLowerCase() }),
        lookupDeezerByIsrc(isrc),
        lookupSpotifyByIsrc(isrc, { market: territory }),
      ]);
      const tracks: CatalogTrack[] = [];
      if (apple?.url && apple.trackName && apple.artistName) {
        const href = httpsUrl(apple.url);
        if (href) {
          tracks.push({
            provider: 'apple_music',
            title: apple.trackName,
            artist: apple.artistName,
            url: href,
            isrc,
            upc: null,
            provenance: 'apple_music_isrc',
            confidence: PROVENANCE_CONFIDENCE.isrc_exact,
          });
        }
      }
      if (deezer?.url) {
        const href = httpsUrl(deezer.url);
        if (href) {
          tracks.push({
            provider: 'deezer',
            title: apple?.trackName ?? isrc,
            artist: apple?.artistName ?? '',
            url: href,
            isrc,
            upc: null,
            provenance: 'deezer_isrc',
            confidence: PROVENANCE_CONFIDENCE.isrc_exact,
          });
        }
      }
      if (spotify?.url) {
        const href = httpsUrl(spotify.url);
        if (href) {
          tracks.push({
            provider: 'spotify',
            title: apple?.trackName ?? isrc,
            artist: apple?.artistName ?? '',
            url: href,
            isrc,
            upc: null,
            provenance: 'spotify_isrc',
            confidence: PROVENANCE_CONFIDENCE.isrc_exact,
          });
        }
      }
      return tracks;
    },
    async trackByUrl(url, territory) {
      const provider = providerForListenUrl(url);
      const href = httpsUrl(url);
      if (!provider || !href) return null;
      if (provider === 'apple_music') {
        const parsed = new URL(href);
        const id =
          parsed.searchParams.get('i') ??
          parsed.pathname.match(/\/(\d+)\/?$/)?.[1];
        if (!id) return null;
        const [row] = await appleLookup(
          `id=${encodeURIComponent(id)}&entity=song&country=${(territory ?? parsed.pathname.split('/')[1] ?? 'US').toLowerCase()}`
        );
        return row ? appleTrack(row) : null;
      }
      if (provider === 'deezer') {
        const id = href.match(/\/track\/(\d+)/)?.[1];
        if (!id) return null;
        const payload = await readJson(
          `https://api.deezer.com/track/${encodeURIComponent(id)}`
        );
        if (!payload || typeof payload !== 'object' || 'error' in payload) {
          return null;
        }
        const record = payload as Record<string, unknown>;
        const title = text(record.title);
        const artist = text(
          (record.artist as { name?: unknown } | undefined)?.name
        );
        const link = httpsUrl(text(record.link));
        if (!title || !artist || !link) return null;
        return {
          provider: 'deezer',
          title,
          artist,
          url: link,
          isrc: text(record.isrc)?.toUpperCase() ?? null,
          upc: null,
          provenance: 'input_url',
          confidence: PROVENANCE_CONFIDENCE.input_url,
        };
      }
      if (provider === 'spotify') {
        const id = href.match(/\/track\/([A-Za-z0-9]{22})/)?.[1];
        const { isSpotifyAvailable, spotifyClient } = await import(
          '@/lib/spotify/client'
        );
        if (id && isSpotifyAvailable()) {
          try {
            const track = await spotifyClient.requestJson<{
              name?: string;
              external_ids?: { isrc?: string };
              artists?: Array<{ name?: string }>;
            }>(
              `/tracks/${id}${territory ? `?market=${territory.toUpperCase()}` : ''}`
            );
            const title = text(track.name);
            const artist = text(track.artists?.[0]?.name);
            if (title && artist) {
              return {
                provider: 'spotify',
                title,
                artist,
                url: href,
                isrc: text(track.external_ids?.isrc)?.toUpperCase() ?? null,
                upc: null,
                provenance: 'input_url',
                confidence: PROVENANCE_CONFIDENCE.input_url,
              };
            }
          } catch {
            // The pasted Spotify URL still stands when credentials are absent.
          }
        }
        return {
          provider: 'spotify',
          title: id ?? 'Spotify track',
          artist: '',
          url: href,
          isrc: null,
          upc: null,
          provenance: 'input_url',
          confidence: PROVENANCE_CONFIDENCE.input_url,
        };
      }
      return {
        provider,
        title: provider,
        artist: '',
        url: href,
        isrc: null,
        upc: null,
        provenance: 'input_url',
        confidence: PROVENANCE_CONFIDENCE.input_url,
      };
    },
    async searchTracks(artist, title, territory = 'US') {
      const term = `${artist} ${title}`;
      const [applePayload, deezerPayload] = await Promise.all([
        readJson(
          `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=8&country=${territory.toLowerCase()}`
        ),
        readJson(
          `https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=8`
        ),
      ]);
      const apple = rows(applePayload).flatMap(row => {
        const track = appleTrack({ ...row });
        return track
          ? [
              {
                ...track,
                provenance: 'exact_name',
                confidence: PROVENANCE_CONFIDENCE.exact_name,
              },
            ]
          : [];
      });
      const deezerRows =
        deezerPayload && typeof deezerPayload === 'object'
          ? (deezerPayload as { data?: unknown }).data
          : [];
      const deezer = (Array.isArray(deezerRows) ? deezerRows : []).flatMap(
        row => {
          if (!row || typeof row !== 'object') return [];
          const record = row as Record<string, unknown>;
          const name = text(record.title);
          const artistName = text(
            (record.artist as { name?: unknown } | undefined)?.name
          );
          const link = httpsUrl(text(record.link));
          if (!name || !artistName || !link) return [];
          return [
            {
              provider: 'deezer',
              title: name,
              artist: artistName,
              url: link,
              isrc: text(record.isrc)?.toUpperCase() ?? null,
              upc: null,
              provenance: 'exact_name',
              confidence: PROVENANCE_CONFIDENCE.exact_name,
            } satisfies CatalogTrack,
          ];
        }
      );
      return [...apple, ...deezer];
    },
    async albumByUpc(upc, territory = 'US') {
      const [appleRows, musicbrainz] = await Promise.all([
        appleLookup(
          `upc=${encodeURIComponent(upc)}&entity=album&country=${territory.toLowerCase()}`
        ),
        import('@/lib/dsp-enrichment/providers/musicbrainz').then(module =>
          module.lookupMusicBrainzReleaseByBarcode(upc).catch(() => null)
        ),
      ]);
      const apple = appleRows.flatMap(row => {
        const album = appleAlbum(row);
        return album ? [album] : [];
      })[0];
      if (apple) return { ...apple, upc };
      if (!musicbrainz?.artist) return null;
      const rel = linksFromRelations(musicbrainz.relations)[0];
      if (!rel) return null;
      return {
        provider: rel.provider,
        title: musicbrainz.title,
        artist: musicbrainz.artist,
        url: rel.url,
        upc: musicbrainz.barcode,
        provenance: 'musicbrainz_url_rel',
        confidence: PROVENANCE_CONFIDENCE.musicbrainz_url_rel,
      };
    },
    async albumByUrl(url, territory) {
      const href = httpsUrl(url);
      const provider = href ? providerForListenUrl(href) : null;
      if (!href || !provider) return null;
      if (provider === 'apple_music') {
        const id = new URL(href).pathname.match(/\/(\d+)\/?$/)?.[1];
        if (!id) return null;
        const [row] = await appleLookup(
          `id=${encodeURIComponent(id)}&entity=album&country=${(territory ?? new URL(href).pathname.split('/')[1] ?? 'US').toLowerCase()}`
        );
        const album = row ? appleAlbum(row) : null;
        return album
          ? {
              ...album,
              provenance: 'input_url',
              confidence: PROVENANCE_CONFIDENCE.input_url,
            }
          : null;
      }
      return {
        provider,
        title: provider,
        artist: '',
        url: href,
        upc: null,
        provenance: 'input_url',
        confidence: PROVENANCE_CONFIDENCE.input_url,
      };
    },
    async searchAlbums(artist, title, territory = 'US') {
      const payload = await readJson(
        `https://itunes.apple.com/search?term=${encodeURIComponent(`${artist} ${title}`)}&entity=album&limit=8&country=${territory.toLowerCase()}`
      );
      return rows(payload).flatMap(row => {
        const album = appleAlbum(row);
        return album
          ? [
              {
                ...album,
                provenance: 'exact_name',
                confidence: PROVENANCE_CONFIDENCE.exact_name,
              },
            ]
          : [];
      });
    },
    async artistCandidates(name) {
      const { matchMusicBrainzArtistByName } = await import(
        '@/lib/dsp-enrichment/providers/musicbrainz'
      );
      const matched = await matchMusicBrainzArtistByName(name, signal);
      if (matched?.status === 'ambiguous') {
        return matched.artists.map(artist => ({
          name: artist.name,
          url: `https://musicbrainz.org/artist/${artist.id}`,
          mbid: artist.id,
          links: [],
        }));
      }
      const candidates: ArtistCandidate[] = [];
      if (matched?.status === 'found') {
        candidates.push(artistFromMusicBrainz(matched.artist));
      }
      const applePayload = await readJson(
        `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=musicArtist&limit=5&country=us`
      );
      for (const row of rows(applePayload)) {
        const artistName = text(row.artistName);
        const href = httpsUrl(text(row.artistLinkUrl));
        if (!artistName || !href) continue;
        candidates.push({
          name: artistName,
          url: href,
          mbid: null,
          links: [
            {
              provider: 'apple_music',
              url: href,
              provenance: 'exact_name',
              confidence: PROVENANCE_CONFIDENCE.exact_name,
            },
          ],
        });
      }
      return candidates;
    },
    async artistByUrl(url) {
      const href = httpsUrl(url);
      if (!href) return [];
      const { getMusicBrainzArtist, lookupMusicBrainzArtistsByUrl } =
        await import('@/lib/dsp-enrichment/providers/musicbrainz');
      const parsed = new URL(href);
      const mbid =
        parsed.hostname === 'musicbrainz.org'
          ? /^\/artist\/([0-9a-f-]{36})\/?$/i.exec(parsed.pathname)?.[1]
          : null;
      if (parsed.hostname === 'musicbrainz.org') {
        if (!mbid) return [];
        const artist = await getMusicBrainzArtist(mbid, {
          includeReleaseGroups: true,
          signal,
        });
        return artist ? [artistFromMusicBrainz(artist)] : [];
      }
      const provider = providerForListenUrl(href);
      // A track or album on a known DSP must not become an artist identity.
      if (
        provider &&
        ['spotify', 'apple_music', 'deezer'].includes(provider) &&
        !isArtistUrl(href, provider)
      )
        return [];
      const matches = await lookupMusicBrainzArtistsByUrl(href, signal);
      if (matches.length > 1)
        return matches.map(artist => ({
          name: artist.name,
          mbid: artist.id,
          url: `https://musicbrainz.org/artist/${artist.id}`,
          links: [],
        }));
      const only = matches[0];
      if (only) {
        const artist = await getMusicBrainzArtist(only.id, {
          includeReleaseGroups: true,
          waitForQuota: true,
          signal,
        });
        if (!artist) return [];
        const candidate = artistFromMusicBrainz(artist);
        return [
          {
            ...candidate,
            links: [
              ...candidate.links,
              ...(provider && isArtistUrl(href, provider)
                ? [
                    {
                      provider,
                      url: href,
                      provenance: 'input_url',
                      confidence: PROVENANCE_CONFIDENCE.input_url,
                    },
                  ]
                : []),
            ],
          },
        ];
      }
      if (!provider || !isArtistUrl(href, provider)) return [];
      return [
        {
          name: '',
          url: href,
          mbid: null,
          links: [
            {
              provider,
              url: href,
              provenance: 'input_url',
              confidence: PROVENANCE_CONFIDENCE.input_url,
            },
          ],
        },
      ];
    },
    async artistByMbid(mbid) {
      const { getMusicBrainzArtist } = await import(
        '@/lib/dsp-enrichment/providers/musicbrainz'
      );
      const artist = await getMusicBrainzArtist(mbid, {
        includeReleaseGroups: true,
        signal,
      });
      if (!artist) return null;
      return artistFromMusicBrainz(artist);
    },
    async urlRelsForIsrc(isrc) {
      const { lookupMusicBrainzRecordingUrlRels } = await import(
        '@/lib/dsp-enrichment/providers/musicbrainz'
      );
      const relations = await lookupMusicBrainzRecordingUrlRels(isrc).catch(
        () => []
      );
      return linksFromRelations(relations);
    },
  };
}
