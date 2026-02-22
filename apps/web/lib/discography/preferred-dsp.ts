import { PROVIDER_CONFIG } from '@/lib/discography/config';
import type { ProviderKey } from '@/lib/discography/types';

export function resolvePreferredProviderKey(
  preferredProvider: string | undefined,
  availableProviders: ReadonlyArray<{ providerId: string; url: string }>
): ProviderKey | null {
  if (!preferredProvider) {
    return null;
  }

  const providerKey = preferredProvider as ProviderKey;
  const hasProvider = availableProviders.some(
    provider => provider.providerId === providerKey
  );

  if (!hasProvider || !PROVIDER_CONFIG[providerKey]) {
    return null;
  }

  return providerKey;
}
