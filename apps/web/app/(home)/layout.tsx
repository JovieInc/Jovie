import './home.css';
import '../../components/marketing/MarketingSnapRail.css';
import { HomeScrollWatcher } from '@/components/homepage/HomeScrollWatcher';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { HOMEPAGE_V3_ENABLED } from '@/lib/flags/homepage-v3';

export const revalidate = false;

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Canonical Pen v3 (dark launch): the one docked landing header with the
  // Customers flyout; the v3 hero opts in to `.marketing-hero-dock` so its
  // texture bleeds under the header to y=0.
  if (HOMEPAGE_V3_ENABLED) {
    return (
      <ClientProviders forceSignedOutDefaults>
        <PublicPageShell
          className='home-viewport min-h-svh overflow-x-clip bg-base text-primary-token'
          footerVariant='expanded'
          logoSize='sm'
        >
          {children}
        </PublicPageShell>
      </ClientProviders>
    );
  }

  // The homepage uses the canonical marketing shell. Dual min-h-svh is
  // intentional: the outer container is at least viewport height, and main
  // holds the hero at full viewport height on its own.
  return (
    <ClientProviders forceSignedOutDefaults>
      <PublicPageShell
        className='home-viewport min-h-svh overflow-x-clip bg-base text-primary-token'
        footerVariant='expanded'
        headerVariant='homepage'
        logoSize='sm'
        logoVariant='icon'
        mainClassName='min-h-svh'
        mainOffset={false}
      >
        <HomeScrollWatcher />
        {children}
      </PublicPageShell>
    </ClientProviders>
  );
}
