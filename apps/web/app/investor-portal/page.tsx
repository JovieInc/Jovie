import { and, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { InvestorBrief } from '@/components/features/pitch/InvestorBrief';
import { db } from '@/lib/db';
import { investorLinks } from '@/lib/db/schema/investors';
import { captureError } from '@/lib/error-tracking';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

/**
 * Investor portal landing page. Token-gated via the `__investor_token`
 * cookie validated by proxy.ts. The cookie lookup remains server-only and is
 * used solely for the optional greeting; engagement events never receive the
 * token or investor identity.
 */
export default async function InvestorLandingPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('__investor_token')?.value;

  let investorName: string | null = null;
  if (token) {
    try {
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
      investorName =
        link && (!link.expiresAt || link.expiresAt > new Date())
          ? link.investorName
          : null;
    } catch (error) {
      await captureError('Investor portal greeting lookup failed', error, {
        context: 'investor_portal_greeting',
      });
    }
  }

  return <InvestorBrief embedded investorName={investorName} />;
}
