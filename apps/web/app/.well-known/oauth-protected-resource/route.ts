import { NextResponse } from 'next/server';
import {
  OVIE_OAUTH_DISCOVERY_HEADERS,
  OVIE_OAUTH_PROTECTED_RESOURCE_METADATA_PATH,
} from '@/lib/ovie/mcp/oauth-contract';

/**
 * Compatibility redirect for clients and scanners that probe the
 * origin-level well-known path. The pathful Ovie resource remains canonical
 * at `/.well-known/oauth-protected-resource/api/ovie/mcp` per RFC 9728.
 */
export const dynamic = 'force-dynamic';

export function GET(request: Request): NextResponse {
  return NextResponse.redirect(
    new URL(OVIE_OAUTH_PROTECTED_RESOURCE_METADATA_PATH, request.url),
    {
      status: 307,
      headers: OVIE_OAUTH_DISCOVERY_HEADERS,
    }
  );
}

export { OPTIONS } from './api/ovie/mcp/route';
