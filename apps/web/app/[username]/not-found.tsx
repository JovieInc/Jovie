import Link from 'next/link';
import { MarketingContainer } from '@/components/marketing';
import { PublicPageShell } from '@/components/site/PublicPageShell';

export default function NotFound() {
  return (
    <PublicPageShell mainClassName='bg-base'>
      <MarketingContainer
        data-testid='not-found'
        width='page'
        className='flex min-h-[calc(100vh-var(--public-shell-header-offset))] items-center justify-center py-16'
      >
        <div className='w-full max-w-md mx-auto text-center px-4 py-16'>
          {/* Error code — oversized, ghosted */}
          <div className='mb-8 select-none'>
            <span
              className='block text-[120px] md:text-[160px] font-semibold leading-none tracking-tighter text-primary-token/[0.34]'
              aria-hidden='true'
            >
              404
            </span>
          </div>

          {/* Content */}
          <div className='-mt-16 relative'>
            <h1 className='text-xl font-semibold text-primary-token tracking-tight mb-2'>
              Page not found
            </h1>
            <p className='text-[13px] text-tertiary-token leading-relaxed mb-8'>
              The link you followed may be broken, or the page may have been
              removed.
            </p>

            <Link
              href='/'
              className='inline-flex items-center justify-center h-8 px-4 text-[13px] font-medium rounded-lg bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] hover:bg-[var(--color-btn-primary-hover)] transition-colors duration-100'
            >
              Go home
            </Link>
          </div>
        </div>
      </MarketingContainer>
    </PublicPageShell>
  );
}
