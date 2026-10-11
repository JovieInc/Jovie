import { NextResponse } from 'next/server';
import {
  ARTIST_MCP_DISCOVERY_HEADERS,
  artistMcpProtectedResourceMetadata,
  isArtistMcpUsername,
} from '@/lib/mcp/artist-oauth-discovery';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
): Promise<NextResponse> {
  const { username } = await params;
  if (!isArtistMcpUsername(username)) {
    return NextResponse.json(
      { error: 'Artist not found' },
      { status: 404, headers: ARTIST_MCP_DISCOVERY_HEADERS }
    );
  }

  const origin = new URL(request.url).origin;
  return NextResponse.json(
    artistMcpProtectedResourceMetadata(origin, username),
    { headers: ARTIST_MCP_DISCOVERY_HEADERS }
  );
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...ARTIST_MCP_DISCOVERY_HEADERS,
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
    },
  });
}
