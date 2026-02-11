import { SkipToContent } from '@/components/atoms/SkipToContent';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { MarketingHeader } from '@/components/site/MarketingHeader';
import { publicEnv } from '@/lib/env-public';

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <ClientProviders publishableKey={publishableKey} skipCoreProviders>
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
    </ClientProviders>
  );
}
