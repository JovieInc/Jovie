import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { investorLinks } from '@/lib/db/schema/investors';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

const DECK_SRC = '/pitch/index.html';

/**
 * Investor portal landing page. Token-gated via the `__investor_token`
 * cookie validated by proxy.ts. Shows a personalized greeting (when the
 * cookie maps to a known investor record) above the canonical HTML deck
 * embedded as a same-origin iframe.
 *
 * The deck source lives at apps/web/public/pitch/ — same artifact used by
 * the public /pitch route. JOV-2357 unified both routes on the canonical
 * deck-stage.js HTML and retired the markdown DeckViewer.
 */
export default async function InvestorLandingPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('__investor_token')?.value;

  let investorName: string | null = null;
  if (token) {
    const [link] = await db
      .select({ investorName: investorLinks.investorName })
      .from(investorLinks)
      .where(eq(investorLinks.token, token))
      .limit(1);
    investorName = link?.investorName ?? null;
  }

  return (
    <div className='flex flex-col'>
      {investorName && (
        <p
          className='px-4 pt-12 pb-2 text-center text-[length:var(--text-2xl)] font-(--font-weight-medium) text-secondary-token sm:px-6 sm:pt-16 lg:pt-20'
          style={{ letterSpacing: 'var(--tracking-normal)' }}
        >
          Hi {investorName}
        </p>
      )}
      <iframe
        src={DECK_SRC}
        title='Jovie Pitch Deck'
        className='block h-[calc(100svh-var(--marketing-header-height,72px))] w-full border-0'
        allow='fullscreen'
        loading='eager'
      />
    </div>
  );
}
