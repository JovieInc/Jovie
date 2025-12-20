import {
  PRIMARY_PROVIDER_KEYS,
  PROVIDER_CONFIG,
} from '@/lib/discography/config';
import type { ProviderKey } from '@/lib/discography/types';
import { buildSmartLinkPath } from '@/lib/discography/utils';

// Export constants that can be used in both server and client components
export const primaryProviderKeys = PRIMARY_PROVIDER_KEYS;
export const providerConfig = PROVIDER_CONFIG;
export const buildSmartPath = buildSmartLinkPath;
export type { ProviderKey };
