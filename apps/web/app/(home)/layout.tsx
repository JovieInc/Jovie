import './home.css';
import { SkipToContent } from '@/components/atoms/SkipToContent';
import { MarketingHeader } from '@/components/site/MarketingHeader';

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className='dark flex min-h-screen flex-col overflow-x-clip bg-[var(--color-bg-base)] text-primary-token'>
      <SkipToContent />
      <MarketingHeader logoSize='xs' variant='minimal' />
      <main id='main-content' className='flex flex-1 flex-col'>
        {children}
      </main>
    </div>
  );
}
