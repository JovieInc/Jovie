import { SkipToContent } from '@/components/atoms';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { MarketingHeader } from '@/components/site/MarketingHeader';

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className='marketing-mono flex min-h-screen flex-col overflow-x-hidden'>
      <SkipToContent />
      <MarketingHeader logoSize='xs' />
      <main id='main-content' className='flex-1'>
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
