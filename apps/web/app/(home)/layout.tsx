import './home.css';
import { SkipToContent } from '@/components/atoms/SkipToContent';
import { HomeScrollWatcher } from '@/components/homepage/HomeScrollWatcher';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { MarketingHeader } from '@/components/site/MarketingHeader';

export const revalidate = false;

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Dual min-h-svh is intentional (Lovable-style hero shell): the outer
  // container is at least viewport height, AND main holds the hero at full
  // viewport height on its own. Header sits in flow above, footer below the
  // fold. Scrolling reveals the footer; the hero is the first paint.
  return (
    <div className='home-viewport dark flex min-h-svh flex-col overflow-x-clip bg-base text-primary-token'>
      <SkipToContent />
      <HomeScrollWatcher />
      <MarketingHeader
        logoSize='sm'
        logoVariant='icon'
        showHomepageCenterNav={false}
        variant='homepage'
      />
      <main id='main-content' className='flex min-h-svh flex-1 flex-col'>
        {children}
      </main>
      <MarketingFooter
        variant='minimal'
        className='system-b-mounted-home-footer'
      />
    </div>
  );
}
