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

interface RespondScreenProps {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel?: string;
  readonly token?: string;
  readonly action?: string;
}

/**
 * Shared screen shell: Jovie wordmark + headline + support line, with an
 * optional confirmation form. The confirm form is the ONLY element that can
 * trigger a stage change, and it navigates via POST.
 */
function RespondScreen({
  title,
  description,
  confirmLabel,
  token,
  action,
}: RespondScreenProps) {
  return (
    <div className='dark flex min-h-screen items-center justify-center bg-(--color-bg-base)'>
      <div className='max-w-md text-center'>
        <span className='mb-6 block text-[length:var(--text-lg)] font-bold tracking-tight text-(--color-text-primary-token)'>
          Jovie
        </span>
        <h1 className='text-[length:var(--text-2xl)] font-(--font-weight-bold) text-(--color-text-primary-token)'>
          {/* ui-casing-allow: marketing sentence-style copy */}
          {title}
        </h1>
        <p className='mt-2 text-(--color-text-tertiary-token)'>{description}</p>
        {confirmLabel ? (
          <form method='post' action='/api/investors/respond' className='mt-8'>
            <input type='hidden' name='token' value={token} />
            <input type='hidden' name='action' value={action} />
            <button
              type='submit'
              className='rounded-(--radius-pill) bg-(--color-text-primary-token) px-8 py-2.5 font-(--font-weight-semibold) text-(--color-bg-base)'
            >
              {confirmLabel}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
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
