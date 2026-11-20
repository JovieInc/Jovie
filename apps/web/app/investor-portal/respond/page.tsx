import { and, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { investorLinks } from '@/lib/db/schema/investors';
import {
  isInvestorClaimTokenShape,
  isInvestorClaimUnexpired,
} from '@/lib/investors/claim-token';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import { RespondScreen } from '../_components/RespondScreen';

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

interface RespondPageProps {
  readonly searchParams: Promise<{
    t?: string;
    action?: string;
    confirmed?: string;
  }>;
}

/**
 * Interest/decline response handler for investor follow-up emails.
 * Token-authenticated via URL param (no cookie needed).
 *
 * GET never mutates (JOV-8888): mail security scanners (Safe Links,
 * Mimecast, Proofpoint) routinely prefetch links, so this page is a
 * read-only confirmation step. The stage change happens only when the
 * confirmation form POSTs to /api/investors/respond.
 *
 * ?t=TOKEN&action=interested → confirmation form → engaged + call_requested
 * ?t=TOKEN&action=pass → confirmation form → passed
 * &confirmed=1 → thank-you screen rendered after the POST redirect
 */
export default async function InvestorRespondPage({
  searchParams,
}: RespondPageProps) {
  const { t: token, action, confirmed } = await searchParams;

  if (
    !token ||
    !isInvestorClaimTokenShape(token) ||
    !action ||
    !['interested', 'pass'].includes(action)
  ) {
    notFound();
  }

  // Read-only token validation: lookup + expiry only, no writes.
  const now = new Date();
  const [link] = await db
    .select({
      id: investorLinks.id,
      stage: investorLinks.stage,
      expiresAt: investorLinks.expiresAt,
    })
    .from(investorLinks)
    .where(
      and(eq(investorLinks.token, token), eq(investorLinks.isActive, true))
    )
    .limit(1);

  if (!link) {
    notFound();
  }

  if (!isInvestorClaimUnexpired(link.expiresAt, now)) {
    notFound();
  }

  if (confirmed === '1') {
    return action === 'interested' ? (
      <RespondScreen
        title='Thanks for your interest!'
        description="We'll be in touch soon to schedule a call."
      />
    ) : (
      <RespondScreen
        title='Thanks for letting us know'
        description='No hard feelings. We appreciate you taking the time.'
      />
    );
  }

  return action === 'interested' ? (
    <RespondScreen
      title='Confirm your interest'
      description='Confirm below so we know it was really you. This tells the team you would like to connect.'
      confirmLabel='Confirm interest'
      token={token}
      action={action}
    />
  ) : (
    <RespondScreen
      title='Confirm you are passing'
      description='Confirm below so we know it was really you. This tells the team you are not interested right now.'
      confirmLabel='Confirm pass'
      token={token}
      action={action}
    />
  );
}
