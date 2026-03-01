import { createFlagsDiscoveryEndpoint, getProviderData } from 'flags/next';

export const GET = createFlagsDiscoveryEndpoint(
  () => {
    return getProviderData({});
  },
  {
    secret: process.env.FLAGS_SECRET,
  }
);
