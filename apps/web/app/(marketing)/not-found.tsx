import Link from 'next/link';
import { MarketingContainer } from '@/components/marketing';

export const revalidate = false;

/**
 * Not-found page for all marketing routes.
 * Rendered inside the (marketing) layout which already provides
 * MarketingHeader and MarketingFooter — so this component must NOT
 * include its own header/footer to avoid double chrome.
 */
export default function NotFound() {
  return (
    <MarketingContainer
      width='page'
      className='system-b-marketing-not-found flex items-center justify-center'
    >
      <div className='w-full max-w-md mx-auto text-center px-4 py-16'>
        {/* Error code — oversized, muted */}
        <div className='mb-8 select-none'>
          <span
            className='system-b-marketing-not-found-code'
            aria-hidden='true'
          >
            404
          </span>
        </div>

        {/* Content */}
        <div className='-mt-16 relative'>
          {/* ui-casing-allow: marketing display headline */}
          <h1 className='text-xl font-semibold text-primary-token tracking-tight mb-2'>
            Page not found
          </h1>
          <p className='text-app text-tertiary-token leading-relaxed mb-8'>
            The link you followed may be broken, or the page may have been
            removed.
          </p>

          <Link href='/' className='public-action-primary'>
            Return home
          </Link>
        </div>
      </div>
    </MarketingContainer>
  );
}
