import {
  PRIMARY_PROVIDER_KEYS,
  PROVIDER_CONFIG,
} from '@/lib/discography/config';
import { buildSmartLinkPath } from '@/lib/discography/utils';
import type { ProviderKey } from '@/lib/discography/types';

// Export constants that can be used in both server and client components
export const primaryProviderKeys = PRIMARY_PROVIDER_KEYS;
export const providerConfig = PROVIDER_CONFIG;
export const buildSmartPath = buildSmartLinkPath;
export type { ProviderKey };
