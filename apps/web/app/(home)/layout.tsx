import './home.css';
import { SkipToContent } from '@/components/atoms/SkipToContent';
import { HomeLegalFooter } from '@/components/homepage/HomeLegalFooter';
import { MarketingHeader } from '@/components/site/MarketingHeader';

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className='home-root dark flex min-h-[100dvh] flex-col bg-[var(--color-bg-base)] text-primary-token'>
      <SkipToContent />
      <MarketingHeader logoSize='xs' variant='minimal' />
      <main id='main-content' className='flex flex-1 flex-col'>
        {children}
      </main>
      <HomeLegalFooter />
    </div>
  );
}
