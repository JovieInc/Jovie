import 'server-only';

import { NextResponse } from 'next/server';
import {
  isPublicProfileDiscoveryEligible,
  PUBLIC_PROFILE_DISCOVERY_EXCLUSION_HEADERS,
  type PublicProfileDiscoveryIdentity,
} from './public-profile-indexing-policy';

export function getPublicProfileDiscoveryExclusionResponse(
  identity: string | PublicProfileDiscoveryIdentity,
  error = 'Artist not found'
): NextResponse | null {
  const resolved: PublicProfileDiscoveryIdentity =
    typeof identity === 'string' ? { handle: identity } : identity;

  if (isPublicProfileDiscoveryEligible(resolved)) {
    return null;
  }

  return NextResponse.json(
    { error },
    { status: 404, headers: PUBLIC_PROFILE_DISCOVERY_EXCLUSION_HEADERS }
  );
}
