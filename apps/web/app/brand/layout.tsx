// Chrome CSS is owned by the layouts that render the marketing chrome, not by
// the root layout (which would ship it to every route). Keep it ahead of the
// route styles so the cascade order matches the former root-layout import.
import '@/components/organisms/HeaderNav.css';
import '@/components/site/MarketingFooter.css';
import '../../components/marketing/MarketingSnapRail.css';
import '../../components/marketing/artist-profile/ArtistProfileLandingPage.css';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { getSiteChrome } from '@/lib/content-records/site-chrome.server';

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
      headerVariant='homepage'
    >
      {children}
    </PublicPageShell>
  );
}
