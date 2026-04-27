import './home.css';
import { SkipToContent } from '@/components/atoms/SkipToContent';
import { HomeLegalFooter } from '@/components/homepage/HomeLegalFooter';
import { MarketingHeader } from '@/components/site/MarketingHeader';
import { APP_ROUTES } from '@/constants/routes';

const HOME_NAV_LINKS = [
  { href: APP_ROUTES.ARTIST_PROFILES, label: 'Product' },
  { href: APP_ROUTES.ARTIST_NOTIFICATIONS, label: 'Solutions' },
  { href: APP_ROUTES.PRICING, label: 'Pricing' },
  { href: APP_ROUTES.BLOG, label: 'Resources' },
] as const;

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
      <MarketingHeader
        logoSize='xs'
        logoVariant='word'
        variant='homepage'
        navLinks={HOME_NAV_LINKS}
      />
      <main id='main-content' className='flex min-h-[100svh] flex-1 flex-col'>
        {children}
      </main>
      <HomeLegalFooter />
    </div>
  );
}
