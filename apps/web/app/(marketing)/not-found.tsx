import Link from 'next/link';
import { Container } from '@/components/site/Container';

/**
 * Not-found page for all marketing routes.
 * Rendered inside the (marketing) layout which already provides
 * MarketingHeader and MarketingFooter — so this component must NOT
 * include its own header/footer to avoid double chrome.
 */
export default function NotFound() {
  return (
    <Container className='flex min-h-[calc(100vh-8rem)] items-center justify-center'>
      <div className='w-full max-w-md mx-auto text-center px-4 py-16'>
        {/* Error code — oversized, muted */}
        <div className='mb-8 select-none'>
          <span
            className='block text-[120px] md:text-[160px] font-semibold leading-none tracking-tighter text-primary-token/[0.06]'
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
            Return home
          </Link>
        </div>
      </div>
    </Container>
  );
}
