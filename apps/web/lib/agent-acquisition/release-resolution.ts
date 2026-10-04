import 'server-only';

import { validateProviderUrl } from '@/lib/discography/provider-domains';
import type { ProviderKey } from '@/lib/discography/types';
import {
  DSP_REGISTRY,
  getRegistryEntry,
  getRegistryEntryByService,
} from '@/lib/dsp-registry';
import { env } from '@/lib/env-server';
import {
  type InHouseQuery,
  type InHouseResolution,
  resolveInHouse,
} from '@/lib/music-resolver/in-house';
import {
  isMusicResolverFamilyEnabled,
  musicfetchNetworkAllowed,
  noteMusicfetchHttpStatus,
} from '@/lib/music-resolver/musicfetch-gate';
import { isMusicfetchVendorUnavailable } from '@/lib/musicfetch/errors';
import {
  MusicfetchRequestError,
  musicfetchRequest,
} from '@/lib/musicfetch/resilient-client';
import { sanitizeText } from '@/lib/spotify/sanitize';
import type { PrepareReleaseLaunchInput } from './draft-contract';

const REQUEST_TIMEOUT_MS = 15_000;
const INVALID_SERVICES = new Set([
  'allMusic',
  'youtubeShorts',
  'napster',
  'telmoreMusik',
]);
const RELEASE_SERVICES = DSP_REGISTRY.filter(
  entry =>
    entry.showOnListenPage && !INVALID_SERVICES.has(entry.musicfetchService)
)
  .map(entry => entry.musicfetchService)
  .join(',');

interface MusicfetchService {
  readonly id?: unknown;
  readonly link?: unknown;
  readonly url?: unknown;
}

interface MusicfetchArtist {
  readonly name?: unknown;
  readonly services?: Record<string, MusicfetchService>;
}

interface MusicfetchRelease {
  readonly type?: unknown;
  readonly name?: unknown;
  readonly releaseDate?: unknown;
  readonly upc?: unknown;
  readonly image?: { readonly url?: unknown };
  readonly artists?: ReadonlyArray<MusicfetchArtist>;
  readonly services?: Record<string, MusicfetchService>;
}

export interface ReleaseFacts {
  readonly source: 'release_url' | 'upc' | 'release_metadata';
  readonly content_type: 'album' | 'track' | null;
  readonly title: string | null;
  readonly artist_name: string | null;
  readonly release_date: string | null;
  readonly artwork_url: string | null;
  readonly upc: string | null;
  readonly dsp_links: Readonly<Record<string, string>>;
  readonly artists: ReadonlyArray<{
    readonly name: string | null;
    readonly ids: Readonly<Record<string, string>>;
  }>;
}

export type ReleaseResolution =
  | { readonly status: 'resolved'; readonly facts: readonly ReleaseFacts[] }
  | {
      readonly status: 'error';
      readonly code:
        | 'INVALID_INPUT'
        | 'RELEASE_NOT_FOUND'
        | 'UNSUPPORTED_RELEASE'
        | 'UPSTREAM_FAILURE';
      readonly retryable: boolean;
    };

function text(value: unknown, max = 300): string | null {
  return typeof value === 'string' && value.trim()
    ? sanitizeText(value, max)
    : null;
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

function date(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (!match) return null;
  const parsed = new Date(`${match[1]}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== match[1]
  )
    return null;
  return match[1]!;
}

function digits(value: unknown): string | null {
  return typeof value === 'string' && /^\d{8,20}$/.test(value) ? value : null;
}

function providerForUrl(value: string) {
  const hostname = new URL(value).hostname.toLowerCase();
  return DSP_REGISTRY.find(
    entry =>
      entry.showOnListenPage &&
      entry.domains.some(
        domain => hostname === domain || hostname.endsWith(`.${domain}`)
      )
  );
}

// Resource shapes are provider-specific: a known domain alone is not evidence
// of a release. Unknown shapes fail closed, including provider short links.
const RELEASE_PATHS: Readonly<Record<string, RegExp>> = {
  spotify: /^\/(?:intl-(?:[a-z]{2})\/)?(?:album|track)\/[A-Za-z0-9]{22}\/?$/,
  apple_music: /^\/[a-z]{2}\/(?:album|song|music-video)\/(?:[^/]+\/)?\d+\/?$/,
  deezer: /^\/(?:[a-z]{2}\/)?(?:album|track)\/\d+\/?$/,
  tidal: /^\/(?:browse\/)?(?:album|track)\/\d+\/?$/,
  amazon_music: /^\/(?:albums|tracks)\/[A-Za-z0-9]+\/?$/,
  bandcamp: /^\/(?:album|track)\/[^/]+\/?$/,
  audiomack: /^\/[^/]+\/(?:album|song)\/[^/]+\/?$/,
  qobuz:
    /^\/(?:[a-z]{2}-[a-z]{2}\/)?(?:album|track)\/(?:[^/]+\/)?[A-Za-z0-9]+\/?$/,
  anghami: /^\/(?:album|song)\/\d+\/?$/,
  boomplay: /^\/(?:albums|songs)\/\d+\/?$/,
  iheartradio: /^\/artist\/[^/]+\/(?:albums|songs)\/[^/]+\/?$/,
  beatport: /^\/(?:[a-z]{2}\/)?(?:release|track)\/[^/]+\/\d+\/?$/,
  amazon: /^\/music\/player\/(?:albums|tracks)\/[A-Z0-9]{10}\/?$/,
  flo: /^\/detail\/(?:album|track)\/\d+\/?$/,
  qq_music: /^\/n\/ryqq\/(?:songDetail|albumDetail)\/[A-Za-z0-9]+\/?$/,
  awa: /^\/(?:album|track)\/[A-Za-z0-9]+\/?$/,
  gaana: /^\/(?:album|song)\/[^/]+\/?$/,
  jio_saavn: /^\/(?:album|song)\/[^/]+\/[^/]+\/?$/,
  joox: /^\/[a-z]{2}\/(?:album|single)\/[^/]+\/?$/,
  kkbox: /^\/(?:[a-z]{2}\/[a-z]{2}\/)?(?:album|song)\/[^/]+\/?$/,
  yandex: /^\/album\/\d+(?:\/track\/\d+)?\/?$/,
  pandora:
    /^\/(?:artist\/[^/]+\/[^/]+\/(?:[^/]+\/)?)?(?:AL|TR)[A-Za-z0-9:]+\/?$/,
};
const SOUNDCLOUD_LISTINGS = new Set([
  'sets',
  'likes',
  'reposts',
  'tracks',
  'albums',
  'popular-tracks',
  'followers',
  'following',
  'comments',
  'stations',
]);

/** Accept canonical album/track resources, never a generic multi-segment path. */
export function isReleaseProviderUrl(value: string): boolean {
  if (!httpsUrl(value)) return false;
  const url = new URL(value);
  const provider = providerForUrl(value);
  if (!provider) return false;
  const path = url.pathname;
  if (provider.key === 'youtube' || provider.key === 'youtube_music') {
    return url.hostname === 'youtu.be'
      ? /^\/[A-Za-z0-9_-]{11}\/?$/.test(path)
      : path === '/watch' &&
          url.searchParams.getAll('v').length === 1 &&
          /^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get('v') ?? '');
  }
  if (provider.key === 'soundcloud') {
    if (
      !['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com'].includes(
        url.hostname
      )
    )
      return false;
    const parts = /^\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/?$/.exec(path);
    return Boolean(
      parts &&
        !SOUNDCLOUD_LISTINGS.has(parts[2]!) &&
        !['discover', 'search', 'you', 'stream', 'charts'].includes(parts[1]!)
    );
  }
  if (provider.key === 'audius') {
    const parts = /^\/([A-Za-z0-9_-]+)\/(?:album\/)?([A-Za-z0-9_-]+)\/?$/.exec(
      path
    );
    return Boolean(
      parts &&
        ![
          'trending',
          'explore',
          'search',
          'feed',
          'settings',
          'upload',
          'embed',
        ].includes(parts[1]!) &&
        ![
          'tracks',
          'albums',
          'playlists',
          'reposts',
          'favorites',
          'followers',
          'following',
          'collectibles',
        ].includes(parts[2]!)
    );
  }
  if (provider.key === 'trebel') {
    return (
      path === '/track' &&
      url.searchParams.getAll('id').length === 1 &&
      /^\d+$/.test(url.searchParams.get('id') ?? '')
    );
  }
  if (provider.key === 'netease') {
    const resource = new URL(
      url.hash.startsWith('#/') ? url.hash.slice(1) : path + url.search,
      url.origin
    );
    return (
      /^\/(?:song|album)\/?$/.test(resource.pathname) &&
      /^\d+$/.test(resource.searchParams.get('id') ?? '')
    );
  }
  if (provider.key === 'line_music') {
    return (
      /^\/webapp\/?$/.test(path) &&
      /^#\/(?:album|track)\/[A-Za-z0-9]+$/.test(url.hash)
    );
  }
  return RELEASE_PATHS[provider.key]?.test(path) ?? false;
}

function mapServices(
  services: Record<string, MusicfetchService> | undefined
): Record<string, string> {
  const links: Record<string, string> = {};
  for (const [service, value] of Object.entries(services ?? {})) {
    const entry = getRegistryEntryByService(service);
    const url = httpsUrl(value.link ?? value.url);
    if (
      entry?.showOnListenPage &&
      url &&
      validateProviderUrl(url, entry.key as ProviderKey).valid &&
      isReleaseProviderUrl(url)
    ) {
      links[entry.key] = url;
    }
  }
  return links;
}

function mapArtists(artists: ReadonlyArray<MusicfetchArtist> | undefined) {
  return (artists ?? []).map(artist => {
    const ids: Record<string, string> = {};
    for (const [service, value] of Object.entries(artist.services ?? {})) {
      const entry = getRegistryEntryByService(service);
      const id = text(value.id, 200);
      if (entry && id) ids[entry.key] = id;
    }
    return { name: text(artist.name), ids };
  });
}

function factsFromMusicfetch(
  result: MusicfetchRelease,
  source: 'release_url' | 'upc',
  sourceUrl?: string
): ReleaseFacts | null {
  const contentType =
    result.type === 'album' || result.type === 'track' ? result.type : null;
  if (!contentType) return null;
  const links = mapServices(result.services);
  if (sourceUrl) {
    const provider = providerForUrl(sourceUrl);
    if (
      provider?.showOnListenPage &&
      !links[provider.key] &&
      isReleaseProviderUrl(sourceUrl)
    ) {
      links[provider.key] = sourceUrl;
    }
  }
  return {
    source,
    content_type: contentType,
    title: text(result.name),
    artist_name: text(result.artists?.[0]?.name),
    release_date: date(result.releaseDate),
    artwork_url: httpsUrl(result.image?.url),
    upc: digits(result.upc),
    dsp_links: links,
    artists: mapArtists(result.artists),
  };
}

function factsFromMetadata(
  metadata: NonNullable<PrepareReleaseLaunchInput['release_metadata']>
): ReleaseFacts | null {
  const links: Record<string, string> = {};
  for (const [provider, url] of Object.entries(metadata.dsp_links ?? {})) {
    const entry = getRegistryEntry(provider);
    if (
      !entry?.showOnListenPage ||
      !validateProviderUrl(url, provider as ProviderKey).valid ||
      !isReleaseProviderUrl(url)
    )
      return null;
    links[provider] = url;
  }
  return {
    source: 'release_metadata',
    content_type: null,
    title: metadata.title ?? null,
    artist_name: metadata.artist_name ?? null,
    release_date: metadata.release_date ?? null,
    artwork_url: metadata.artwork_url ?? null,
    upc: metadata.upc ?? null,
    dsp_links: links,
    artists: metadata.artist_name
      ? [{ name: metadata.artist_name, ids: {} }]
      : [],
  };
}

interface MusicfetchFactsLookup {
  readonly facts: ReleaseFacts | null;
  readonly unavailable: boolean;
}

function inHouseQuery(input: PrepareReleaseLaunchInput): InHouseQuery | null {
  if (input.release_url) {
    const parsed = new URL(input.release_url);
    const appleTrackOnAlbumPage =
      parsed.hostname === 'music.apple.com' && parsed.searchParams.has('i');
    const album =
      !appleTrackOnAlbumPage &&
      /\/(?:album|albums)(?:\/|$)/i.test(parsed.pathname);
    return album
      ? { kind: 'album', url: input.release_url }
      : { kind: 'track', url: input.release_url };
  }
  if (input.upc) return { kind: 'album', upc: input.upc };
  return null;
}

function factsFromInHouse(
  resolved: InHouseResolution,
  source: 'release_url' | 'upc',
  upc?: string
): ReleaseFacts | null {
  if (resolved.status !== 'resolved') return null;
  const links: Record<string, string> = {};
  for (const link of resolved.links) {
    const entry = getRegistryEntry(link.provider);
    if (
      !entry?.showOnListenPage ||
      !validateProviderUrl(link.url, link.provider as ProviderKey).valid ||
      !isReleaseProviderUrl(link.url)
    ) {
      continue;
    }
    links[link.provider] = link.url;
  }
  if (Object.keys(links).length === 0 && !resolved.title) return null;
  return {
    source,
    content_type: resolved.kind === 'album' ? 'album' : 'track',
    title: text(resolved.title),
    artist_name: text(resolved.artist),
    release_date: null,
    artwork_url: null,
    upc: digits(resolved.upc) ?? (source === 'upc' ? (upc ?? null) : null),
    dsp_links: links,
    artists: text(resolved.artist)
      ? [{ name: text(resolved.artist), ids: {} }]
      : [],
  };
}

async function resolveAgentReleaseInHouse(
  input: PrepareReleaseLaunchInput
): Promise<{
  facts: ReleaseFacts | null;
  outcome: 'resolved' | 'miss' | 'upstream';
}> {
  const query = inHouseQuery(input);
  if (!query) return { facts: null, outcome: 'miss' };
  const resolved = await resolveInHouse(query);
  if (resolved.status === 'upstream_error') {
    return { facts: null, outcome: 'upstream' };
  }
  const facts = factsFromInHouse(
    resolved,
    input.release_url ? 'release_url' : 'upc',
    input.upc
  );
  return facts
    ? { facts, outcome: 'resolved' }
    : { facts: null, outcome: 'miss' };
}

function musicfetchVendorDown(error: unknown): boolean {
  if (isMusicfetchVendorUnavailable(error)) return true;
  return (
    error instanceof MusicfetchRequestError &&
    (error.statusCode === 401 || error.statusCode === 403)
  );
}

async function musicfetchFacts(
  endpoint: '/url' | '/upc',
  field: 'url' | 'upc',
  value: string
): Promise<MusicfetchFactsLookup> {
  try {
    const response = await musicfetchRequest<{ result?: MusicfetchRelease }>(
      endpoint,
      new URLSearchParams({ [field]: value, services: RELEASE_SERVICES }),
      { timeoutMs: REQUEST_TIMEOUT_MS }
    );
    const facts = response.result
      ? factsFromMusicfetch(
          response.result,
          field === 'url' ? 'release_url' : 'upc',
          field === 'url' ? value : undefined
        )
      : null;
    return {
      facts:
        facts && field === 'upc' && !facts.upc
          ? { ...facts, upc: value }
          : facts,
      unavailable: false,
    };
  } catch (error) {
    if (error instanceof MusicfetchRequestError) {
      noteMusicfetchHttpStatus(error.statusCode ?? 0, error.message);
    }
    if (musicfetchVendorDown(error)) {
      return { facts: null, unavailable: true };
    }
    throw error;
  }
}

/** Resolve public release facts without importing, publishing or querying owners. */
export async function resolveAgentRelease(
  input: PrepareReleaseLaunchInput
): Promise<ReleaseResolution> {
  try {
    if (
      input.release_url &&
      (!providerForUrl(input.release_url) ||
        !isReleaseProviderUrl(input.release_url))
    ) {
      return { status: 'error', code: 'UNSUPPORTED_RELEASE', retryable: false };
    }
    let inHouseAttempted = false;
    if (input.release_url || input.upc) {
      if (isMusicResolverFamilyEnabled('release_facts')) {
        inHouseAttempted = true;
        const house = await resolveAgentReleaseInHouse(input);
        if (house.facts) {
          const facts = [house.facts];
          if (input.release_metadata) {
            const supplied = factsFromMetadata(input.release_metadata);
            if (!supplied) {
              return {
                status: 'error',
                code: 'INVALID_INPUT',
                retryable: false,
              };
            }
            facts.push(supplied);
          }
          return { status: 'resolved', facts };
        }
        if (!musicfetchNetworkAllowed() || !env.MUSICFETCH_API_TOKEN) {
          return {
            status: 'error',
            code:
              house.outcome === 'upstream'
                ? 'UPSTREAM_FAILURE'
                : 'RELEASE_NOT_FOUND',
            retryable: false,
          };
        }
      } else if (!musicfetchNetworkAllowed()) {
        return {
          status: 'error',
          code: 'UPSTREAM_FAILURE',
          retryable: false,
        };
      }
    }
    const lookups: Array<Promise<MusicfetchFactsLookup>> = [];
    if (input.release_url)
      lookups.push(musicfetchFacts('/url', 'url', input.release_url));
    if (input.upc) lookups.push(musicfetchFacts('/upc', 'upc', input.upc));
    const lookupResults = await Promise.all(lookups);
    if (
      lookupResults.some(result => !result.unavailable && result.facts === null)
    ) {
      return { status: 'error', code: 'RELEASE_NOT_FOUND', retryable: false };
    }
    const facts = lookupResults.flatMap(result =>
      result.facts ? [result.facts] : []
    );
    const vendorUnavailable = lookupResults.some(result => result.unavailable);
    let resolvedInHouse = false;
    if (vendorUnavailable && facts.length === 0 && !inHouseAttempted) {
      const house = await resolveAgentReleaseInHouse(input);
      if (house.facts) {
        facts.push(house.facts);
        resolvedInHouse = true;
      }
    }
    if (!resolvedInHouse && input.release_metadata) {
      const supplied = factsFromMetadata(input.release_metadata);
      if (!supplied)
        return { status: 'error', code: 'INVALID_INPUT', retryable: false };
      facts.push(supplied);
    }
    if (facts.length > 0) return { status: 'resolved', facts };
    if (vendorUnavailable) {
      return { status: 'error', code: 'UPSTREAM_FAILURE', retryable: false };
    }
    return { status: 'error', code: 'RELEASE_NOT_FOUND', retryable: false };
  } catch (error) {
    // Only a catalog miss says anything about the supplied release. Auth,
    // subscription and request-contract failures belong to the provider path.
    if (error instanceof MusicfetchRequestError && error.statusCode === 401) {
      noteMusicfetchHttpStatus(401, error.message);
      return {
        status: 'error',
        code: 'UPSTREAM_FAILURE',
        retryable: false,
      };
    }
    const notFound =
      error instanceof MusicfetchRequestError && error.statusCode === 404;
    return {
      status: 'error',
      code: notFound ? 'RELEASE_NOT_FOUND' : 'UPSTREAM_FAILURE',
      retryable: !notFound,
    };
  }
}
