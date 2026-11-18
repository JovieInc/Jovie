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
