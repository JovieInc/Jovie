import { and, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { investorLinks, investorSettings } from '@/lib/db/schema/investors';
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
 * ?t=TOKEN&action=interested → update stage, redirect to calendar
 * ?t=TOKEN&action=pass → update stage, show thank-you
 */
export default async function InvestorRespondPage({
  searchParams,
}: RespondPageProps) {
  const { t: token, action } = await searchParams;

  if (!token || !action || !['interested', 'pass'].includes(action)) {
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

  // Reject expired tokens
  if (link.expiresAt && new Date(link.expiresAt) < now) {
    notFound();
  }

  // Fetch settings for calendar URL
  const [settings] = await db.select().from(investorSettings).limit(1);

  if (action === 'interested') {
    // Update stage to meeting_booked (only advance forward)
    const advanceableStages = ['shared', 'viewed', 'engaged'];
    if (advanceableStages.includes(link.stage)) {
      await db
        .update(investorLinks)
        .set({ stage: 'meeting_booked', updatedAt: new Date() })
        .where(eq(investorLinks.id, link.id));
    }

    // Redirect to calendar
    const calendarUrl = settings?.bookCallUrl;
    if (calendarUrl) {
      redirect(calendarUrl);
    }

    // Fallback if no calendar URL configured
    return (
      <div className='dark flex min-h-screen items-center justify-center bg-[var(--color-bg-base)]'>
        <div className='text-center'>
          <span className='mb-6 block text-[length:var(--text-lg)] font-bold tracking-tight text-[var(--color-text-primary-token)]'>
            Jovie
          </span>
          <h1 className='text-[length:var(--text-2xl)] font-[var(--font-weight-bold)] text-[var(--color-text-primary-token)]'>
            Thanks for your interest!
          </h1>
          <p className='mt-2 text-[var(--color-text-tertiary-token)]'>
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
    <div className='dark flex min-h-screen items-center justify-center bg-[var(--color-bg-base)]'>
      <div className='max-w-md text-center'>
        <span className='mb-6 block text-[length:var(--text-lg)] font-bold tracking-tight text-[var(--color-text-primary-token)]'>
          Jovie
        </span>
        <h1 className='text-[length:var(--text-2xl)] font-[var(--font-weight-bold)] text-[var(--color-text-primary-token)]'>
          Thanks for letting us know
        </h1>
        <p className='mt-2 text-[var(--color-text-tertiary-token)]'>
          No hard feelings. We appreciate you taking the time.
        </p>
      </div>
    </div>
  );
}
