import './home.css';
import '../../components/marketing/MarketingSnapRail.css';
import { HomeScrollWatcher } from '@/components/homepage/HomeScrollWatcher';
import { PublicPageShell } from '@/components/site/PublicPageShell';

export const revalidate = false;

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Quiet wordmark over the photo hero. No product taxonomy in the header —
  // the editorial composition owns the viewport. Dual min-h-svh is
  // intentional: the outer container is at least viewport height, and main
  // holds the hero at full viewport height on its own.
  return (
    <PublicPageShell
      className='home-viewport dark min-h-svh overflow-x-clip bg-base text-primary-token'
      footerClassName='system-b-mounted-home-footer'
      footerVariant='minimal'
      headerVariant='homepage'
      logoSize='sm'
      logoVariant='word'
      mainClassName='min-h-svh'
      mainOffset={false}
      showHomepageCenterNav={false}
    >
      <HomeScrollWatcher />
      {children}
    </PublicPageShell>
  );
}
