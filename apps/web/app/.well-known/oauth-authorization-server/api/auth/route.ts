import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/better-auth';
import { ensureAuthorizationServerEndpoints } from '@/lib/mcp/artist-oauth-discovery';

export const dynamic = 'force-dynamic';

const readMetadata = oauthProviderAuthServerMetadata(auth);

/**
 * RFC 8414 metadata for the Better Auth issuer at `/api/auth`.
 * Clients that read `authorization_servers` from artist MCP protected-resource
 * metadata fetch this path, not the origin-level alias.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const upstream = await readMetadata(request);
  const metadata: unknown = await upstream.json().catch(() => null);
  const origin = new URL(request.url).origin;
  const document =
    metadata !== null &&
    typeof metadata === 'object' &&
    !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const headers = new Headers(upstream.headers);
  headers.delete('content-length');
  headers.delete('content-type');
  if (!headers.has('access-control-allow-origin')) {
    headers.set('access-control-allow-origin', '*');
  }
  return NextResponse.json(
    ensureAuthorizationServerEndpoints(document, origin),
    { status: upstream.status, headers }
  );
}
