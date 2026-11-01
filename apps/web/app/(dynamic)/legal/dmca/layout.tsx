import { MarketingContainer } from '@/components/marketing';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { getSiteChrome } from '@/lib/content-records/site-chrome.server';

export const revalidate = false;

export default async function DmcaLegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const chrome = await getSiteChrome();
  return (
    <PublicPageShell
      chrome={chrome}
      className='public-legal-shell bg-base text-primary-token'
      headerVariant='minimal'
      logoSize='sm'
    >
      <MarketingContainer
        className='public-legal-content py-16 sm:py-20'
        width='page'
      >
        {children}
      </MarketingContainer>
    </PublicPageShell>
  );
}
