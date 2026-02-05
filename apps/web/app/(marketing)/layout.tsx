import { SkipToContent } from '@/components/atoms/SkipToContent';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { MarketingHeader } from '@/components/site/MarketingHeader';

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className='marketing-mono flex min-h-screen flex-col overflow-x-hidden'
      style={{
        backgroundColor: 'var(--linear-bg-footer)',
        color: 'var(--linear-text-primary)',
      }}
    >
      <SkipToContent />
      <MarketingHeader logoSize='xs' />
      <main
        id='main-content'
        className='flex-1'
        style={{
          display: 'flex',
          flexDirection: 'column',
          paddingTop: 'var(--linear-header-height)',
        }}
      >
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
