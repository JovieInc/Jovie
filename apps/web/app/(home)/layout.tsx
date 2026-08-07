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
  // The homepage composes the shared PublicPageShell as an intentional
  // variant: homepage header chrome (icon logo, no center nav), minimal
  // footer, and no fixed-header main offset.
  // Dual min-h-svh is intentional (Lovable-style hero shell): the outer
  // container is at least viewport height, AND main holds the hero at full
  // viewport height on its own. Header sits in flow above, footer below the
  // fold. Scrolling reveals the footer; the hero is the first paint.
  return (
    <PublicPageShell
      className='home-viewport dark min-h-svh overflow-x-clip bg-base text-primary-token'
      footerClassName='system-b-mounted-home-footer'
      footerVariant='minimal'
      headerVariant='homepage'
      logoSize='sm'
      logoVariant='icon'
      mainClassName='min-h-svh'
      mainOffset={false}
      showHomepageCenterNav={false}
    >
      <HomeScrollWatcher />
      {children}
    </PublicPageShell>
  );
}
