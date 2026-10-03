import { and, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { investorLinks, investorViews } from '@/lib/db/schema/investors';
import {
  isInvestorClaimTokenShape,
  isInvestorClaimUnexpired,
} from '@/lib/investors/claim-token';
import { buildInvestorEventPath } from '@/lib/investors/portal-events';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

interface RespondPageProps {
  readonly searchParams: Promise<{ t?: string; action?: string }>;
}

/**
 * Interest/decline response handler for investor follow-up emails.
 * Token-authenticated via URL param (no cookie needed).
 *
 * ?t=TOKEN&action=interested → record the ask, no calendar
 * ?t=TOKEN&action=pass → update stage, show thank-you
 */
export default async function InvestorRespondPage({
  searchParams,
}: RespondPageProps) {
  const { t: token, action } = await searchParams;

  if (
    !token ||
    !isInvestorClaimTokenShape(token) ||
    !action ||
    !['interested', 'pass'].includes(action)
  ) {
    notFound();
  }

  // Validate token (active + not expired)
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

  if (action === 'interested') {
    const advanceableStages = ['shared', 'viewed'];
    if (advanceableStages.includes(link.stage)) {
      await db
        .update(investorLinks)
        .set({ stage: 'engaged', updatedAt: new Date() })
        .where(eq(investorLinks.id, link.id));
    }

    await db.insert(investorViews).values({
      investorLinkId: link.id,
      pagePath: buildInvestorEventPath('call_requested'),
    });

    return (
      <div className='dark flex min-h-screen items-center justify-center bg-(--color-bg-base)'>
        <div className='text-center'>
          <span className='mb-6 block text-[length:var(--text-lg)] font-bold tracking-tight text-(--color-text-primary-token)'>
            Jovie
          </span>
          <h1 className='text-[length:var(--text-2xl)] font-(--font-weight-bold) text-(--color-text-primary-token)'>
            {/* ui-casing-allow: marketing sentence-style copy */}
            Thanks for your interest!
          </h1>
          <p className='mt-2 text-(--color-text-tertiary-token)'>
            We&apos;ll be in touch soon to schedule a call.
          </p>
        </div>
      </div>
    );
  }

  // action === 'pass'
  await db
    .update(investorLinks)
    .set({ stage: 'passed', updatedAt: new Date() })
    .where(eq(investorLinks.id, link.id));

  return (
    <div className='dark flex min-h-screen items-center justify-center bg-(--color-bg-base)'>
      <div className='max-w-md text-center'>
        <span className='mb-6 block text-[length:var(--text-lg)] font-bold tracking-tight text-(--color-text-primary-token)'>
          Jovie
        </span>
        <h1 className='text-[length:var(--text-2xl)] font-(--font-weight-bold) text-(--color-text-primary-token)'>
          {/* ui-casing-allow: marketing sentence-style copy */}
          Thanks for letting us know
        </h1>
        <p className='mt-2 text-(--color-text-tertiary-token)'>
          No hard feelings. We appreciate you taking the time.
        </p>
      </div>
    </div>
  );
}
