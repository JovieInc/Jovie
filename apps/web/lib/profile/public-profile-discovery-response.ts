import 'server-only';

import { NextResponse } from 'next/server';
import {
  isPublicProfileIndexable,
  PUBLIC_PROFILE_DISCOVERY_EXCLUSION_HEADERS,
} from './public-profile-indexing-policy';

export function getPublicProfileDiscoveryExclusionResponse(
  handle: string,
  error = 'Artist not found'
): NextResponse | null {
  if (isPublicProfileIndexable(handle)) {
    return null;
  }

  return NextResponse.json(
    { error },
    { status: 404, headers: PUBLIC_PROFILE_DISCOVERY_EXCLUSION_HEADERS }
  );
}
