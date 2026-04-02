import './home.css';
import { SkipToContent } from '@/components/atoms/SkipToContent';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { MarketingHeader } from '@/components/site/MarketingHeader';

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      data-theme='linear'
      className='linear-marketing flex min-h-screen flex-col overflow-x-clip bg-page text-primary-token'
    >
      <SkipToContent />
      <MarketingHeader logoSize='xs' />
      <main
        id='main-content'
        className='flex flex-1 flex-col pt-[var(--linear-header-height)]'
      >
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
