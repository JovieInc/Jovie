import { createFlagsDiscoveryEndpoint } from 'flags/next';
import { APP_FLAG_PROVIDER_DATA } from '@/lib/flags/registry';

export const GET = createFlagsDiscoveryEndpoint(
  () => {
    return {
      definitions: APP_FLAG_PROVIDER_DATA.definitions,
      hints: APP_FLAG_PROVIDER_DATA.hints,
      overrideEncryptionMode: 'plaintext',
    };
  },
  {
    secret: process.env.FLAGS_SECRET,
  }
);
