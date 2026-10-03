import 'server-only';

import type { MusicBrainzRelation } from '@/lib/dsp-enrichment/types';
import { getRegistryEntry, PROVIDER_DOMAINS } from '@/lib/dsp-registry';

import {
  type ArtistCandidate,
  type CatalogAlbum,
  type CatalogTrack,
  type InHouseSources,
  PROVENANCE_CONFIDENCE,
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

async function readJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
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

async function appleLookup(params: string): Promise<Record<string, unknown>[]> {
  const payload = await readJson(`https://itunes.apple.com/lookup?${params}`);
  return rows(payload);
}

export function createDefaultInHouseSources(): InHouseSources {
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
    async trackByUrl(url) {
      const provider = providerForListenUrl(url);
      const href = httpsUrl(url);
      if (!provider || !href) return null;
      if (provider === 'apple_music') {
        const id = href.match(/\/(\d+)\/?$/)?.[1];
        if (!id) return null;
        const [row] = await appleLookup(
          `id=${encodeURIComponent(id)}&entity=song&country=us`
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
            }>(`/tracks/${id}`);
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
    async searchTracks(artist, title) {
      const term = `${artist} ${title}`;
      const [applePayload, deezerPayload] = await Promise.all([
        readJson(
          `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=8&country=us`
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
    async albumByUpc(upc) {
      const [appleRows, musicbrainz] = await Promise.all([
        appleLookup(`upc=${encodeURIComponent(upc)}&entity=album`),
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
    async albumByUrl(url) {
      const href = httpsUrl(url);
      const provider = href ? providerForListenUrl(href) : null;
      if (!href || !provider) return null;
      if (provider === 'apple_music') {
        const id = href.match(/\/(\d+)\/?$/)?.[1];
        if (!id) return null;
        const [row] = await appleLookup(
          `id=${encodeURIComponent(id)}&entity=album`
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
    async searchAlbums(artist, title) {
      const payload = await readJson(
        `https://itunes.apple.com/search?term=${encodeURIComponent(`${artist} ${title}`)}&entity=album&limit=8&country=us`
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
      const matched = await matchMusicBrainzArtistByName(name).catch(
        () => null
      );
      if (matched?.status === 'ambiguous') {
        return Array.from({ length: matched.count }, (_, index) => ({
          name,
          url: `https://musicbrainz.org/artist/ambiguous-${index}`,
          mbid: `ambiguous-${index}`,
          links: [],
        }));
      }
      const candidates: ArtistCandidate[] = [];
      if (matched?.status === 'found') {
        const homepage = linksFromRelations(matched.artist.relations)[0];
        candidates.push({
          name: matched.artist.name,
          url:
            homepage?.url ??
            `https://musicbrainz.org/artist/${matched.artist.id}`,
          mbid: matched.artist.id,
          links: linksFromRelations(matched.artist.relations),
        });
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
      const provider = href ? providerForListenUrl(href) : null;
      if (!href || !provider) return null;
      return {
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
      };
    },
    async artistByMbid(mbid) {
      const { getMusicBrainzArtist } = await import(
        '@/lib/dsp-enrichment/providers/musicbrainz'
      );
      const artist = await getMusicBrainzArtist(mbid).catch(() => null);
      if (!artist) return null;
      const links = linksFromRelations(artist.relations);
      return {
        name: artist.name,
        url: links[0]?.url ?? `https://musicbrainz.org/artist/${artist.id}`,
        mbid: artist.id,
        links,
      };
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
