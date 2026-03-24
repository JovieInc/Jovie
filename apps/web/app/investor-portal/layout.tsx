import { and, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { PROFILE_HOSTNAME } from '@/constants/domains';
import { db } from '@/lib/db';
import { investorLinks, investorSettings } from '@/lib/db/schema/investors';
import { getInvestorManifest } from '@/lib/investors/manifest';
import { InvestorNav } from './_components/InvestorNav';
import { InvestorStickyBar } from './_components/InvestorStickyBar';

const INVESTOR_TOKEN_COOKIE = '__investor_token';

export const metadata: Metadata = {
  title: 'Jovie — Investors',
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

/**
 * Validate that the request is from the investor subdomain or has a valid token.
 * Prevents unauthenticated access on the primary host.
 */
async function requireInvestorAccess(): Promise<void> {
  const headersList = await headers();
  const host = headersList.get('host') ?? '';

  const isInvestorHost =
    host === `investors.${PROFILE_HOSTNAME}` ||
    host === 'investors.localhost' ||
    host === 'investors.localhost:3000' ||
    host === 'investors.jov.ie';

  if (isInvestorHost) return;

  const cookieStore = await cookies();
  const token = cookieStore.get(INVESTOR_TOKEN_COOKIE)?.value;

  if (!token) {
    notFound();
  }

  const [link] = await db
    .select({
      id: investorLinks.id,
      isActive: investorLinks.isActive,
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

  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    notFound();
  }
}

/**
 * Investor portal layout.
 * Dark mode only. No marketing header/footer.
 * Left sidebar nav + bottom sticky action bar.
 *
 * Access guard: validates token via cookie or subdomain.
 */
export default async function InvestorLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  await requireInvestorAccess();

  const cookieStore = await cookies();
  const token = cookieStore.get(INVESTOR_TOKEN_COOKIE)?.value;

  // Fetch investor name for personalized greeting
  let investorName: string | null = null;
  if (token) {
    const [link] = await db
      .select({ investorName: investorLinks.investorName })
      .from(investorLinks)
      .where(eq(investorLinks.token, token))
      .limit(1);
    investorName = link?.investorName ?? null;
  }

  // Fetch portal settings and manifest in parallel
  const [settingsResult, manifest] = await Promise.all([
    db.select().from(investorSettings).limit(1),
    getInvestorManifest(),
  ]);
  const settings = settingsResult[0];
  const navPages = manifest.pages
    .filter(p => p.nav)
    .map(p => ({ slug: p.slug, title: p.title }));

  return (
    <div className='dark min-h-screen bg-[var(--color-bg-base)] text-[var(--color-text-primary-token)]'>
      <div className='flex min-h-screen'>
        {/* Left sidebar nav — 200px fixed on desktop */}
        <InvestorNav investorName={investorName} pages={navPages} />

        {/* Main content area */}
        <main className='flex-1 pb-20 pt-14 lg:pb-24 lg:pt-0'>{children}</main>
      </div>

      {/* Bottom sticky action bar */}
      <InvestorStickyBar
        bookCallUrl={settings?.bookCallUrl ?? null}
        investUrl={settings?.investUrl ?? null}
        showProgress={settings?.showProgressBar ?? false}
        raiseTarget={settings?.raiseTarget ?? null}
        committedAmount={settings?.committedAmount ?? null}
        investorCount={settings?.investorCount ?? null}
      />
    </div>
  );
}
