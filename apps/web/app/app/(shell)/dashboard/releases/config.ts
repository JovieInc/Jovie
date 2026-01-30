// Export constants that can be used in both server and client components
export {
  PRIMARY_PROVIDER_KEYS as primaryProviderKeys,
  PROVIDER_CONFIG as providerConfig,
} from '@/lib/discography/config';
export type { ProviderKey } from '@/lib/discography/types';
export { buildSmartLinkPath as buildSmartPath } from '@/lib/discography/utils';
