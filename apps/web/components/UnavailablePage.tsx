import Link from 'next/link';
import { BrandLogo } from '@/components/atoms/BrandLogo';

/**
 * Generic "service unavailable" page shown to blocked users.
 *
 * Used by:
 * - app/unavailable/page.tsx (via middleware rewrite for non-/app paths)
 * - app/app/(shell)/layout.tsx (inline render for /app paths)
 *
 * Intentionally minimal. No error codes, no support links,
 * no language that indicates account-level enforcement.
 */
export function UnavailablePage() {
  return (
    <div className='fixed inset-0 isolate flex flex-col items-center bg-page text-primary-token overflow-y-auto overflow-x-clip [color-scheme:dark] px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 overflow-hidden'
      >
        <div className='absolute left-1/2 top-[8%] h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-accent/12 blur-[120px] sm:top-[10%] sm:h-[34rem] sm:w-[34rem]' />
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.045),transparent_42%)]' />
        <div className='absolute inset-0 bg-[linear-gradient(180deg,rgba(15,16,17,0.72)_0%,rgba(8,9,10,0.96)_68%)]' />
      </div>

      <div className='w-full max-w-[420px] relative z-10 flex flex-col items-center'>
        <div className='mb-6 sm:mb-8'>
          <Link
            href='/'
            className='block focus-ring-themed rounded-md'
            aria-label='Go to homepage'
          >
            <BrandLogo size={32} tone='auto' />
          </Link>
        </div>

        <h1 className='text-[18px] leading-[22px] font-medium text-primary-token text-center mb-4'>
          Jovie is unavailable right now
        </h1>

        <p className='text-[13px] leading-5 text-secondary-token text-center'>
          Please try again later.
        </p>
      </div>
    </div>
  );
}
