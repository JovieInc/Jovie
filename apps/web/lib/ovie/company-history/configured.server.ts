import 'server-only';

import {
  configuredGithubOwner,
  readConfiguredSearchCounts,
} from '@/lib/ovie/shipping-state/configured.server';
import { getRedis } from '@/lib/redis';
import { syncCompanyHistory } from './store.server';

/** The hourly fill, with the configured HUD GitHub token and the shared Redis. */
export function syncConfiguredCompanyHistory(now = new Date()) {
  return syncCompanyHistory(now, {
    redis: getRedis(),
    owner: configuredGithubOwner(),
    searchCounts: readConfiguredSearchCounts,
  });
}
