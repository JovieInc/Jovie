import './marketing-utilities.css';
import { SkipToContent } from '@/components/atoms/SkipToContent';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { MarketingHeader } from '@/components/site/MarketingHeader';
import { MarketingEnhancements } from '@/features/home/MarketingEnhancements';

export default async function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className='dark linear-marketing flex min-h-screen flex-col overflow-x-clip bg-black text-primary-token'>
      <SkipToContent />
      <MarketingHeader logoSize='xs' />
      <main
        id='main-content'
        className='flex flex-1 flex-col pt-[var(--linear-header-height)]'
      >
        {children}
        <MarketingEnhancements />
      </main>
      <MarketingFooter />
      <div aria-hidden='true' className='marketing-noise' />
    </div>
  );
}
