import './home.css';
import '../../components/marketing/MarketingSnapRail.css';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { PublicPageShell } from '@/components/site/PublicPageShell';

export const revalidate = false;

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Tim: the existing minimal site header owns the one O mark and Sign in.
  // The hero keeps its full-viewport composition behind the fixed header.
  return (
    <ClientProviders forceSignedOutDefaults>
      <PublicPageShell
        className='home-viewport min-h-svh overflow-x-clip bg-base text-primary-token'
        footerVariant='expanded'
        logoSize='sm'
        headerVariant='minimal'
        headerOverlay
        headerBrand='icon'
        navLinks={[]}
        mainOffset={false}
      >
        {children}
      </PublicPageShell>
    </ClientProviders>
  );
}
