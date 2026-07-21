import { SkipToContent } from '@/components/atoms/SkipToContent';
import { HomeLegalFooter } from '@/components/homepage/HomeLegalFooter';
import { MarketingHeader } from '@/components/site/MarketingHeader';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

export const revalidate = false;

export default function BrandLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className='system-b-marketing dark system-b-brand-layout'>
      <SkipToContent />
      <MarketingHeader
        logoSize='sm'
        logoVariant='icon'
        showHomepageCenterNav={FEATURE_FLAGS.SHOW_HOMEPAGE_CENTER_NAV}
        variant='homepage'
      />
      <main id='main-content' className='system-b-brand-main'>
        {children}
      </main>
      <HomeLegalFooter />
    </div>
  );
}
