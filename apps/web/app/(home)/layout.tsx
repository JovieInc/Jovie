import './home.css';
import { SkipToContent } from '@/components/atoms/SkipToContent';
import { HomeLegalFooter } from '@/components/homepage/HomeLegalFooter';
import { HomeScrollWatcher } from '@/components/homepage/HomeScrollWatcher';
import { MarketingHeader } from '@/components/site/MarketingHeader';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

export const revalidate = false;

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Dual min-h-[100svh] is intentional (Lovable-style hero shell): the outer
  // container is at least viewport height, AND main holds the hero at full
  // viewport height on its own. Header sits in flow above, footer below the
  // fold. Scrolling reveals the footer; the hero is the first paint.
  return (
    <div className='home-viewport dark flex min-h-[100svh] flex-col overflow-x-clip bg-[var(--color-bg-base)] text-primary-token'>
      <SkipToContent />
      <HomeScrollWatcher />
      <MarketingHeader
        logoSize='sm'
        logoVariant='icon'
        showHomepageCenterNav={FEATURE_FLAGS.SHOW_HOMEPAGE_CENTER_NAV}
        variant='homepage'
      />
      <main id='main-content' className='flex min-h-[100svh] flex-1 flex-col'>
        {children}
      </main>
      <HomeLegalFooter />
    </div>
  );
}
