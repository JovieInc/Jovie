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
        backgroundColor: 'rgb(8, 9, 10)', // Linear's dark background
        color: 'rgb(247, 248, 248)', // Linear's light text
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
          paddingTop: '64px', // Linear has 64px padding-top on main
          borderStyle: 'none',
          borderColor: 'rgb(247, 248, 248)',
        }}
      >
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
