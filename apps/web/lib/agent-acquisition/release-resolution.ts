import 'server-only';

import { validateProviderUrl } from '@/lib/discography/provider-domains';
import type { ProviderKey } from '@/lib/discography/types';
import {
  DSP_REGISTRY,
  getRegistryEntry,
  getRegistryEntryByService,
} from '@/lib/dsp-registry';
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

interface MusicfetchRelease {
  readonly type?: unknown;
  readonly name?: unknown;
  readonly releaseDate?: unknown;
  readonly upc?: unknown;
  readonly image?: { readonly url?: unknown };
  readonly artists?: ReadonlyArray<{
    readonly name?: unknown;
    readonly services?: Record<string, MusicfetchService>;
  }>;
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
  readonly artist_ids: Readonly<Record<string, string>>;
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
  return DSP_REGISTRY.find(entry =>
    entry.domains.some(
      domain => hostname === domain || hostname.endsWith(`.${domain}`)
    )
  );
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
      validateProviderUrl(url, entry.key as ProviderKey).valid
    ) {
      links[entry.key] = url;
    }
  }
  return links;
}

function mapArtistIds(
  artists: MusicfetchRelease['artists']
): Record<string, string> {
  const ids: Record<string, string> = {};
  for (const [service, value] of Object.entries(artists?.[0]?.services ?? {})) {
    const entry = getRegistryEntryByService(service);
    const id = text(value.id, 200);
    if (entry && id) ids[entry.key] = id;
  }
  return ids;
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
    if (provider?.showOnListenPage && !links[provider.key]) {
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
    artist_ids: mapArtistIds(result.artists),
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
      !validateProviderUrl(url, provider as ProviderKey).valid
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
    artist_ids: {},
  };
}

async function musicfetchFacts(
  endpoint: '/url' | '/upc',
  field: 'url' | 'upc',
  value: string
): Promise<ReleaseFacts | null> {
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
  return facts && field === 'upc' && !facts.upc
    ? { ...facts, upc: value }
    : facts;
}

/** Resolve public release facts without importing, publishing or querying owners. */
export async function resolveAgentRelease(
  input: PrepareReleaseLaunchInput
): Promise<ReleaseResolution> {
  try {
    if (input.release_url && !providerForUrl(input.release_url)) {
      return { status: 'error', code: 'UNSUPPORTED_RELEASE', retryable: false };
    }
    const lookups: Array<Promise<ReleaseFacts | null>> = [];
    if (input.release_url)
      lookups.push(musicfetchFacts('/url', 'url', input.release_url));
    if (input.upc) lookups.push(musicfetchFacts('/upc', 'upc', input.upc));
    const facts = (await Promise.all(lookups)).filter(
      (value): value is ReleaseFacts => value !== null
    );
    if (lookups.length > 0 && facts.length !== lookups.length) {
      return { status: 'error', code: 'RELEASE_NOT_FOUND', retryable: false };
    }
    if (input.release_metadata) {
      const supplied = factsFromMetadata(input.release_metadata);
      if (!supplied)
        return { status: 'error', code: 'INVALID_INPUT', retryable: false };
      facts.push(supplied);
    }
    return facts.length > 0
      ? { status: 'resolved', facts }
      : { status: 'error', code: 'RELEASE_NOT_FOUND', retryable: false };
  } catch (error) {
    const permanent =
      error instanceof MusicfetchRequestError &&
      error.statusCode !== undefined &&
      error.statusCode >= 400 &&
      error.statusCode < 500 &&
      error.statusCode !== 429;
    return {
      status: 'error',
      code: permanent ? 'RELEASE_NOT_FOUND' : 'UPSTREAM_FAILURE',
      retryable: !permanent,
    };
  }
}
