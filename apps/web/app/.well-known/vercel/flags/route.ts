import { createFlagsDiscoveryEndpoint, getProviderData } from 'flags/next';
import * as homepage from '@/lib/flags/homepage';

export const GET = createFlagsDiscoveryEndpoint(() => {
  const flags: Record<string, (typeof homepage.homepageFlags)[number]> = {};
  for (const f of homepage.homepageFlags) {
    flags[f.key] = f;
  }
  return getProviderData(flags);
});
