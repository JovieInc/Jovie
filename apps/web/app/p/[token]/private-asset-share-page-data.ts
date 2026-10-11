import 'server-only';

import { headers } from 'next/headers';
import { cache } from 'react';
import type { LibraryAssetSharePublicView } from '@/lib/library/asset-share';
import { buildLibraryAssetSharePublicViewByToken } from '@/lib/library/asset-share-public.server';
import {
  allowIfRateLimitBackendDegraded,
  libraryAssetShareAccessLimiter,
} from '@/lib/rate-limit';
import { extractClientIP } from '@/lib/utils/ip-extraction';

export type PrivateAssetSharePageData =
  | Readonly<{ status: 'rate_limited' }>
  | Readonly<{ status: 'not_found' }>
  | Readonly<{
      status: 'ready';
      view: LibraryAssetSharePublicView;
    }>;

/**
 * Throttle the unauthenticated token surface before its database lookup.
 * React cache shares the decision and view between generateMetadata and the
 * page body, so one request consumes one quota unit and performs one lookup.
 */
export async function loadPrivateAssetSharePageData(
  token: string
): Promise<PrivateAssetSharePageData> {
  const requestHeaders = await headers();
  const rateLimit = allowIfRateLimitBackendDegraded(
    await libraryAssetShareAccessLimiter.limit(extractClientIP(requestHeaders)),
    { route: '/p/[token]' }
  );

  if (!rateLimit.success) {
    return { status: 'rate_limited' };
  }

  const view = await buildLibraryAssetSharePublicViewByToken(token);
  return view ? { status: 'ready', view } : { status: 'not_found' };
}

export const getPrivateAssetSharePageData = cache(
  loadPrivateAssetSharePageData
);
