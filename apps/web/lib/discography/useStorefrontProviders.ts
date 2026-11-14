'use client';

import { useEffect, useMemo, useState } from 'react';
import { localizeProviderUrl, readVisitorCountryCookie } from './storefront';
import type { ProviderConfidence, ProviderKey } from './types';

export interface StorefrontProvider {
  key: ProviderKey;
  label: string;
  accent: string;
  url: string | null;
  confidence?: ProviderConfidence;
}

/** Preserve ISR markup, then localize available provider links after hydration. */
export function useStorefrontProviders(providers: StorefrontProvider[]) {
  const [country, setCountry] = useState<string | null>(null);
  useEffect(() => {
    setCountry(readVisitorCountryCookie());
  }, []);

  return useMemo(
    () =>
      providers
        .filter((provider): provider is StorefrontProvider & { url: string } =>
          Boolean(provider.url)
        )
        .map(provider => ({
          ...provider,
          url: localizeProviderUrl(provider.key, provider.url, country),
        })),
    [providers, country]
  );
}
