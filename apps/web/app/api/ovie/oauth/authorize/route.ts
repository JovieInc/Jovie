import { NextRequest, NextResponse } from 'next/server';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  createOvieOAuthHandoff,
  OVIE_OAUTH_HANDOFF_TTL_SECONDS,
  ovieOAuthHandoffCookie,
  ovieOAuthRecoveryPurpose,
  readOvieAuthorizationRequest,
  readOvieOAuthHandoff,
} from '@/lib/ovie/mcp/authorization-request';
import {
  getOvieOAuthIssuer,
  isOvieOAuthFounder,
  ovieFounderLoginLocation,
  ovieIssuerSecret,
} from '@/lib/ovie/mcp/oauth';
import { requireOvieApiAccess } from '@/lib/ovie/privacy-lock/access';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const nonce = url.searchParams.get('handoff');
  const cookieName = nonce ? ovieOAuthHandoffCookie(nonce) : null;
  const authorization = nonce
    ? url.searchParams.size === 1 && cookieName
      ? readOvieOAuthHandoff(
          nonce,
          new NextRequest(request).cookies.get(cookieName)?.value
        )
      : null
    : readOvieAuthorizationRequest(url.searchParams);
  if (!authorization) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const { clientId, redirectUri, challenge, state } = authorization;

  function recoveryRedirect(kind: 'signin' | 'reset' | 'verify') {
    const handoff =
      nonce && cookieName
        ? {
            nonce,
            cookieName,
            cookieValue: null,
            authorizePath: `/api/ovie/oauth/authorize?handoff=${nonce}`,
            verifyPath: `/ovie/connect?handoff=${nonce}`,
          }
        : createOvieOAuthHandoff(url.searchParams);
    const path =
      kind === 'verify'
        ? handoff.verifyPath
        : ovieFounderLoginLocation(handoff.authorizePath, kind === 'reset');
    const response = NextResponse.redirect(new URL(path, url.origin), {
      headers: {
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
    if (handoff.cookieValue) {
      response.cookies.set(handoff.cookieName, handoff.cookieValue, {
        httpOnly: true,
        secure: url.protocol === 'https:',
        sameSite: 'lax',
        path: '/',
        maxAge: OVIE_OAUTH_HANDOFF_TTL_SECONDS,
      });
    }
    return response;
  }

  const entitlements = await getCurrentUserEntitlements({ session: 'fresh' });
  const dbAdmin = entitlements.userId
    ? await checkAdminRole(entitlements.userId)
    : false;
  const founder = isOvieOAuthFounder({
    authenticated: entitlements.isAuthenticated,
    entitlementsAdmin: entitlements.isAdmin,
    dbAdmin,
  });
  if (!founder) {
    return recoveryRedirect(entitlements.isAuthenticated ? 'reset' : 'signin');
  }

  const denied = await requireOvieApiAccess({ privileged: true });
  if (denied) {
    if (await ovieOAuthRecoveryPurpose(denied)) {
      return recoveryRedirect('verify');
    }
    return denied;
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
    const response = NextResponse.redirect(target, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
    if (cookieName) response.cookies.delete(cookieName);
    return response;
  } catch {
    return NextResponse.json({ error: 'access_denied' }, { status: 403 });
  }
}
