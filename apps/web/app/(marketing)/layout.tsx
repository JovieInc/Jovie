import { SkipToContent } from '@/components/atoms/SkipToContent';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { MarketingHeader } from '@/components/site/MarketingHeader';
import { MarketingScrollUnlock } from '@/features/home/MarketingScrollUnlock';
import { ScrollRevealInit } from '@/features/home/ScrollRevealInit';

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
        <MarketingScrollUnlock />
        <ScrollRevealInit />
      </main>
      <MarketingFooter />
    </div>
  );
}
