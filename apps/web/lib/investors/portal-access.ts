import 'server-only';
import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { isAdmin } from '@/lib/admin/roles';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { investorLinks } from '@/lib/db/schema/investors';
import { captureError } from '@/lib/error-tracking';
import {
  isInvestorClaimTokenShape,
  isInvestorClaimUnexpired,
} from '@/lib/investors/claim-token';

export const INVESTOR_TOKEN_COOKIE = '__investor_token';

/**
 * Headers for every investor surface, including its 404s. Investor content is
 * never indexable and never stored by a shared cache.
 */
export const INVESTOR_PRIVATE_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
  'Cache-Control': 'private, no-store',
} as const;

export type InvestorPortalAccess =
  | { readonly kind: 'investor'; readonly investorName: string | null }
  | { readonly kind: 'admin' };

async function resolveInvestorLinkAccess(
  token: string
): Promise<InvestorPortalAccess | null> {
  if (!isInvestorClaimTokenShape(token)) return null;

  const [link] = await db
    .select({
      investorName: investorLinks.investorName,
      expiresAt: investorLinks.expiresAt,
    })
    .from(investorLinks)
    .where(
      and(eq(investorLinks.token, token), eq(investorLinks.isActive, true))
    )
    .limit(1);

  if (!link || !isInvestorClaimUnexpired(link.expiresAt)) return null;
  return { kind: 'investor', investorName: link.investorName };
}

/**
 * Server-side gate for every investor-portal surface. Access requires an
 * active, unexpired investor link cookie or a signed-in admin. Anything else,
 * including lookup failures, resolves to null so callers render a neutral 404.
 */
export const getInvestorPortalAccess = cache(
  async function getInvestorPortalAccess(): Promise<InvestorPortalAccess | null> {
    try {
      const token = (await cookies()).get(INVESTOR_TOKEN_COOKIE)?.value;
      if (token) {
        const investorAccess = await resolveInvestorLinkAccess(token);
        if (investorAccess) return investorAccess;
      }

      const { userId } = await getCachedAuth();
      if (userId && (await isAdmin(userId))) return { kind: 'admin' };
    } catch (error) {
      await captureError('Investor portal access check failed', error, {
        context: 'investor_portal_access',
      });
    }

    return null;
  }
);
