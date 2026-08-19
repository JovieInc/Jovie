import { NextResponse } from 'next/server';
import { getOvieOAuthIssuer, ovieIssuerSecret } from '@/lib/ovie/mcp/oauth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => ({}));
  try {
    const client = getOvieOAuthIssuer(ovieIssuerSecret()).registerClient(
      (body ?? {}) as { redirect_uris?: unknown }
    );
    return NextResponse.json(
      { ...client, token_endpoint_auth_method: 'none' },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: String(error) },
      { status: 400 }
    );
  }
}
