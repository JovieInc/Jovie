import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  extractBearer,
  getOvieOAuthIssuer,
  OVIE_OAUTH_SCOPES,
  ovieIssuerSecret,
} from '@/lib/ovie/mcp/oauth';
import type { OvieMcpPrincipal } from '@/lib/ovie/mcp/types';

/**
 * Founder gate principal: OAuth/lander bearer first, then Better Auth session.
 * Invalid bearer fails closed. Not Clerk-cookie-only. Not a new /api/mcp door.
 */
export async function resolveOviePrincipal(
  request: Request
): Promise<OvieMcpPrincipal> {
  const bearer = extractBearer(request.headers.get('authorization'));
  if (bearer) {
    const claims = getOvieOAuthIssuer(ovieIssuerSecret()).verifyAccessToken(
      bearer
    );
    if (claims) {
      return {
        authenticated: true,
        isAdmin: claims.isAdmin,
        subject: claims.sub,
        email: claims.email,
        scopes: claims.scopes,
      };
    }
    return { authenticated: false, isAdmin: false, scopes: [] };
  }

  const entitlements = await getCurrentUserEntitlements();
  return {
    authenticated: entitlements.isAuthenticated,
    isAdmin: entitlements.isAdmin,
    subject: entitlements.userId ?? undefined,
    email: entitlements.email ?? undefined,
    scopes: entitlements.isAdmin ? [...OVIE_OAUTH_SCOPES] : [],
  };
}
