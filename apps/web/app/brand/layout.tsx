import { SkipToContent } from '@/components/atoms/SkipToContent';
import { HomeLegalFooter } from '@/components/homepage/HomeLegalFooter';
import { HomepageV2FinalCta } from '@/components/marketing/homepage-v2/HomepageV2Ctas';
import { MarketingHeader } from '@/components/site/MarketingHeader';

export const revalidate = false;

export default function BrandLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className='dark flex min-h-[100svh] flex-col overflow-x-clip bg-[var(--color-bg-base)] text-primary-token'>
      <SkipToContent />
      <MarketingHeader logoSize='sm' logoVariant='icon' variant='homepage' />
      <main id='main-content' className='flex flex-1 flex-col'>
        {children}
      </main>
      <HomepageV2FinalCta />
      <HomeLegalFooter />
    </div>
  );
}
