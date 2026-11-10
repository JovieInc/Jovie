import '../../components/marketing/MarketingSnapRail.css';
import '../../components/marketing/artist-profile/ArtistProfileLandingPage.css';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { getSiteChrome } from '@/lib/content-records/site-chrome.server';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

export const revalidate = false;

export default async function BrandLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const chrome = await getSiteChrome();
  return (
    <PublicPageShell
      chrome={chrome}
      className='system-b-marketing dark system-b-brand-layout'
      footerVariant='expanded'
      logoSize='sm'
      logoVariant='icon'
      mainClassName='system-b-brand-main'
      mainOffset={false}
      showHomepageCenterNav={FEATURE_FLAGS.SHOW_HOMEPAGE_CENTER_NAV}
      headerVariant='homepage'
    >
      {children}
    </PublicPageShell>
  );
}
