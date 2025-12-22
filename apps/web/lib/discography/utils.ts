import type { ProviderKey } from './types';

export function buildReleaseSlug(profileId: string, releaseId: string): string {
  return `${releaseId}--${profileId}`;
}

export function normalizeBaseUrl(baseUrl: string): string {
  if (!baseUrl) return '';
  return baseUrl.replace(/\/$/, '');
}

export function buildSmartLinkPath(
  slug: string,
  provider?: ProviderKey
): string {
  const query = provider ? `?provider=${encodeURIComponent(provider)}` : '';
  return `/r/${slug}${query}`;
}

export function buildSmartLinkUrl(
  baseUrl: string,
  slug: string,
  provider?: ProviderKey
): string {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  return `${normalizedBase}${buildSmartLinkPath(slug, provider)}`;
}
