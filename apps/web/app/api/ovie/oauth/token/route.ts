import { NextResponse } from 'next/server';
import { getOvieOAuthIssuer, ovieIssuerSecret } from '@/lib/ovie/mcp/oauth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const contentType = request.headers.get('content-type') ?? '';
  const params = contentType.includes('application/x-www-form-urlencoded')
    ? Object.fromEntries(new URLSearchParams(await request.text()))
    : ((await request.json().catch(() => ({}))) as Record<string, string>);

  const grantType = params.grant_type ?? 'authorization_code';
  const issuer = getOvieOAuthIssuer(ovieIssuerSecret());

  try {
    if (grantType === 'refresh_token') {
      const issued = issuer.refreshAccessToken({
        refreshToken: params.refresh_token ?? '',
        clientId: params.client_id ?? '',
      });
      return NextResponse.json(issued);
    }
    if (grantType !== 'authorization_code') {
      return NextResponse.json(
        { error: 'unsupported_grant_type' },
        { status: 400 }
      );
    }
    const issued = issuer.exchangeToken({
      clientId: params.client_id ?? '',
      redirectUri: params.redirect_uri ?? '',
      code: params.code ?? '',
      codeVerifier: params.code_verifier ?? '',
    });
    return NextResponse.json(issued);
  } catch (error) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: String(error) },
      { status: 400 }
    );
  }
}
