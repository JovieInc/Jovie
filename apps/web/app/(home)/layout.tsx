import './home.css';
import Link from 'next/link';
import { SkipToContent } from '@/components/atoms/SkipToContent';
import { MarketingHeader } from '@/components/site/MarketingHeader';
import { APP_ROUTES } from '@/constants/routes';

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className='dark linear-marketing flex min-h-screen flex-col overflow-x-clip bg-black text-primary-token'>
      <SkipToContent />
      <MarketingHeader logoSize='xs' />
      <main id='main-content' className='flex flex-1 flex-col'>
        {children}
      </main>
      <footer className='home-legal-bar'>
        <nav
          className='mx-auto flex w-full max-w-[var(--linear-content-max)] items-center justify-center gap-3 px-5 pb-6 pt-3 text-[11px] tracking-[-0.01em] sm:px-6 lg:px-0'
          aria-label='Legal'
        >
          <Link
            href={APP_ROUTES.LEGAL_PRIVACY}
            className='home-legal-link focus-ring-themed rounded-md px-1.5 py-0.5'
          >
            Privacy
          </Link>
          <span aria-hidden='true' className='text-secondary-token/60'>
            ·
          </span>
          <Link
            href={APP_ROUTES.LEGAL_TERMS}
            className='home-legal-link focus-ring-themed rounded-md px-1.5 py-0.5'
          >
            Terms
          </Link>
        </nav>
      </footer>
    </div>
  );
}
