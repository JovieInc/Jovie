import { NextResponse } from 'next/server';
import {
  PUBLIC_ARTIST_API_COMMON_HEADERS,
  PUBLIC_ARTIST_API_DISCOVERY_CACHE_CONTROL,
  PUBLIC_ARTIST_API_INDEX,
} from '@/lib/api/v1/contract';

export const revalidate = false;
export const dynamic = 'force-static';

/**
 * Public API capability discovery. This endpoint intentionally does not
 * enumerate profiles or require a user-owned handle.
 */
export function GET() {
  return NextResponse.json(PUBLIC_ARTIST_API_INDEX, {
    headers: {
      ...PUBLIC_ARTIST_API_COMMON_HEADERS,
      'Cache-Control': PUBLIC_ARTIST_API_DISCOVERY_CACHE_CONTROL,
    },
  });
}
