import { NextResponse } from 'next/server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { getOvieOAuthIssuer, ovieIssuerSecret } from '@/lib/ovie/mcp/oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const clientId = url.searchParams.get('client_id') ?? '';
  const redirectUri = url.searchParams.get('redirect_uri') ?? '';
  const challenge = url.searchParams.get('code_challenge') ?? '';
  const method = url.searchParams.get('code_challenge_method') ?? '';
  const state = url.searchParams.get('state') ?? '';
  if (!clientId || !redirectUri || !challenge || method !== 'S256') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated) {
    const next = encodeURIComponent(`${url.pathname}${url.search}`);
    return NextResponse.redirect(new URL(`/identity?next=${next}`, url.origin));
  }

  try {
    const code = getOvieOAuthIssuer(ovieIssuerSecret()).issueCode({
      clientId,
      redirectUri,
      codeChallenge: challenge,
      subject: entitlements.userId ?? entitlements.email ?? 'founder',
      email: entitlements.email ?? undefined,
      isAdmin: entitlements.isAdmin,
    });
    const target = new URL(redirectUri);
    target.searchParams.set('code', code);
    if (state) target.searchParams.set('state', state);
    return NextResponse.redirect(target);
  } catch (error) {
    return NextResponse.json(
      { error: 'access_denied', error_description: String(error) },
      { status: 403 }
    );
  }
}
