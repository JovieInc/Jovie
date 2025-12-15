import Link from 'next/link';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { MarketingHeader } from '@/components/site/MarketingHeader';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className='flex min-h-screen flex-col'>
      <Link
        href='#main-content'
        className='sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-md focus:bg-surface-1 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-token focus:shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500/50 dark:focus:ring-white/40 dark:focus:ring-offset-gray-900'
      >
        Skip to content
      </Link>
      <MarketingHeader logoSize='xs' />
      <main id='main-content' tabIndex={-1} className='flex-1 outline-none'>
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
