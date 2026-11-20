import '../../../components/marketing/MarketingSnapRail.css';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { MarketingEnhancements } from '@/features/home/MarketingEnhancements';
import { getSiteChrome } from '@/lib/content-records/site-chrome.server';

export default async function PlaylistsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const chrome = await getSiteChrome();
  return (
    <PublicPageShell
      chrome={chrome}
      className='system-b-marketing dark overflow-x-clip bg-base text-primary-token'
      logoSize='xs'
    >
      {children}
      <MarketingEnhancements />
      <div aria-hidden='true' className='marketing-noise' />
    </PublicPageShell>
  );
}
