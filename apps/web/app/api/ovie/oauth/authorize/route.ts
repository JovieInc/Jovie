import { NextResponse } from 'next/server';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  getOvieOAuthIssuer,
  isOvieOAuthFounder,
  ovieFounderLoginLocation,
  ovieIssuerSecret,
} from '@/lib/ovie/mcp/oauth';

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
  const dbAdmin = entitlements.userId
    ? await checkAdminRole(entitlements.userId)
    : false;
  const founder = isOvieOAuthFounder({
    authenticated: entitlements.isAuthenticated,
    entitlementsAdmin: entitlements.isAdmin,
    dbAdmin,
  });
  if (!founder) {
    const next = `${url.pathname}${url.search}`;
    return NextResponse.redirect(
      new URL(
        ovieFounderLoginLocation(next, entitlements.isAuthenticated),
        url.origin
      )
    );
  }

  try {
    const code = getOvieOAuthIssuer(ovieIssuerSecret()).issueCode({
      clientId,
      redirectUri,
      codeChallenge: challenge,
      subject: entitlements.userId ?? entitlements.email ?? 'founder',
      email: entitlements.email ?? undefined,
      isAdmin: true,
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
