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
    <div className='home-viewport dark flex min-h-[100svh] flex-col overflow-x-clip bg-[var(--color-bg-base)] text-primary-token'>
      <SkipToContent />
      <MarketingHeader logoSize='xs' variant='minimal' />
      <main id='main-content' className='flex min-h-[100svh] flex-1 flex-col'>
        {children}
      </main>
      <MarketingFooter variant='minimal' />
    </div>
  );
}
