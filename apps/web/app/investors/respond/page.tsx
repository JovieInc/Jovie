import { and, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { investorLinks, investorSettings } from '@/lib/db/schema/investors';

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

  // Validate token
  const [link] = await db
    .select({ id: investorLinks.id, stage: investorLinks.stage })
    .from(investorLinks)
    .where(
      and(eq(investorLinks.token, token), eq(investorLinks.isActive, true))
    )
    .limit(1);

  if (!link) {
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
      <div className='flex min-h-screen items-center justify-center bg-[var(--color-bg-base)]'>
        <div className='text-center'>
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
    <div className='flex min-h-screen items-center justify-center bg-[var(--color-bg-base)]'>
      <div className='max-w-md text-center'>
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
