import 'server-only';

import { isReleaseProviderUrl } from '@/lib/agent-acquisition/release-resolution';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import { validateProviderUrl } from '@/lib/discography/provider-domains';
import type { ProviderKey } from '@/lib/discography/types';
import { DSP_REGISTRY, getRegistryEntryByService } from '@/lib/dsp-registry';
import type { LinkProvider } from './contract';
import { providerKeyForUrl } from './parse-input';
import type { ResolvedRelease } from './types';

const INVALID_SERVICES = new Set([
  'allMusic',
  'youtubeShorts',
  'napster',
  'telmoreMusik',
]);

export const SMART_LINK_MUSICFETCH_SERVICES = DSP_REGISTRY.filter(
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

function text(value: unknown, max = 300): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
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

function providerForService(service: string) {
  return getRegistryEntryByService(service);
}

export function providersFromServices(
  services: Record<string, MusicfetchService> | undefined,
  options: { readonly releaseOnly: boolean }
): LinkProvider[] {
  const links: LinkProvider[] = [];
  const seen = new Set<string>();
  for (const [service, value] of Object.entries(services ?? {})) {
    const entry = providerForService(service);
    const url = httpsUrl(value?.link ?? value?.url);
    if (!entry?.showOnListenPage || !url || seen.has(entry.key)) continue;
    const allowed = options.releaseOnly
      ? validateProviderUrl(url, entry.key as ProviderKey).valid &&
        isReleaseProviderUrl(url)
      : validateProviderUrl(url, entry.key as ProviderKey).valid ||
        providerKeyForUrl(url) !== null;
    if (!allowed) continue;
    const config = PROVIDER_CONFIG[entry.key];
    if (!config) continue;
    seen.add(entry.key);
    links.push({ key: entry.key, label: config.label, url });
  }
  return links;
}

function artistName(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const first = value[0];
  if (!first || typeof first !== 'object') return null;
  return text((first as { name?: unknown }).name);
}

export function releaseFromMusicfetch(
  payload: unknown,
  sourceUrl?: string,
  options: { readonly releaseOnly?: boolean } = {}
): ResolvedRelease | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as {
    result?: unknown;
    type?: unknown;
    name?: unknown;
    upc?: unknown;
    isrc?: unknown;
    image?: { url?: unknown };
    artists?: unknown;
    services?: Record<string, MusicfetchService>;
  };
  const result =
    record.result && typeof record.result === 'object'
      ? (record.result as typeof record)
      : record;
  const providers = providersFromServices(result.services, {
    releaseOnly: options.releaseOnly !== false,
  });
  if (sourceUrl) {
    const key = providerKeyForUrl(sourceUrl);
    const provider = key?.split(':')[0];
    const config = provider ? PROVIDER_CONFIG[provider] : undefined;
    if (
      config &&
      provider &&
      !providers.some(item => item.key === provider) &&
      isReleaseProviderUrl(sourceUrl)
    ) {
      providers.unshift({ key: provider, label: config.label, url: sourceUrl });
    }
  }
  if (providers.length === 0 && !text(result.name)) return null;
  const isrc = text(result.isrc, 32);
  return {
    title: text(result.name),
    artist: artistName(result.artists),
    artworkUrl: httpsUrl(result.image?.url),
    isrc:
      isrc && /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc.toUpperCase())
        ? isrc.toUpperCase()
        : null,
    upc:
      typeof result.upc === 'string' && /^\d{8,20}$/.test(result.upc)
        ? result.upc
        : null,
    providerKey: providerKeyForUrl(providers[0]?.url ?? sourceUrl ?? ''),
    providers,
  };
}

export function candidatesFromSearch(payload: unknown): Array<{
  id: string;
  name: string;
  artist: string | null;
  url: string | null;
  artworkUrl: string | null;
}> {
  const found: Array<{
    id: string;
    name: string;
    artist: string | null;
    url: string | null;
    artworkUrl: string | null;
  }> = [];
  const seen = new Set<string>();

  function visit(value: unknown, depth: number): void {
    if (depth > 6 || found.length >= 5 || value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const type = record.type;
    const named = text(record.name) ?? text(record.title);
    const services = record.services;
    const direct = httpsUrl(record.url) ?? httpsUrl(record.link);
    const fromServices =
      services && typeof services === 'object'
        ? (providersFromServices(
            services as Record<string, MusicfetchService>,
            {
              releaseOnly: true,
            }
          )[0]?.url ?? null)
        : null;
    const url = direct && isReleaseProviderUrl(direct) ? direct : fromServices;
    const acceptableType =
      type === 'track' || type === 'album' || type === undefined;
    if (named && url && acceptableType && !seen.has(url)) {
      seen.add(url);
      found.push({
        id: providerKeyForUrl(url) ?? url,
        name: named,
        artist: artistName(record.artists),
        url,
        artworkUrl: httpsUrl(
          (record.image as { url?: unknown } | undefined)?.url
        ),
      });
    }
    for (const child of Object.values(record)) visit(child, depth + 1);
  }

  visit(payload, 0);
  return found;
}
