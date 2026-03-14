import { toISOStringOrFallback } from '@/lib/utils/date';
import { PRIMARY_PROVIDER_KEYS, PROVIDER_CONFIG } from './config';
import type { ProviderKey, ProviderSource } from './types';
import { buildSmartLinkPath } from './utils';

interface ProviderLinkRecord {
  providerId: string;
  url: string | null;
  sourceType?: string | null;
  updatedAt?: Date | string | null;
}

interface ProviderViewModelOptions {
  providerLinks: ProviderLinkRecord[];
  profileHandle: string;
  slug: string;
}

export function buildProviderLabels(): Record<ProviderKey, string> {
  return Object.entries(PROVIDER_CONFIG).reduce(
    (acc, [key, value]) => {
      acc[key as ProviderKey] = value.label;
      return acc;
    },
    {} as Record<ProviderKey, string>
  );
}

function mapProviderSource(
  sourceType: string | null | undefined
): ProviderSource {
  return sourceType === 'manual' ? 'manual' : 'ingested';
}

export function mapProviderLinksToViewModel({
  providerLinks,
  profileHandle,
  slug,
}: ProviderViewModelOptions) {
  return (Object.keys(PROVIDER_CONFIG) as ProviderKey[])
    .map(providerKey => {
      const label = PROVIDER_CONFIG[providerKey].label;
      const match = providerLinks.find(link => link.providerId === providerKey);
      const url = match?.url ?? '';

      return {
        key: providerKey,
        label,
        url,
        source: mapProviderSource(match?.sourceType),
        updatedAt: toISOStringOrFallback(match?.updatedAt),
        path: url ? buildSmartLinkPath(profileHandle, slug, providerKey) : '',
        isPrimary: PRIMARY_PROVIDER_KEYS.includes(providerKey),
      };
    })
    .filter(provider => provider.url !== '');
}
