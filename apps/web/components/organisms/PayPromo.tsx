'use client';
import { CTASection } from '@/components/organisms/CTASection';

export default function PayPromo() {
  return (
    <CTASection
      title={
        <>
          Pay, <span className='text-indigo-400'>instantly.</span>
        </>
      }
      description={
        <>
          Fans tap once, you get paid. No sign-ups, no fees,{' '}
          <br className='max-sm:hidden sm:inline' />
          just pure support—directly in Venmo.
        </>
      }
      buttonText='See it live'
      buttonHref='/tim/pay'
      variant='secondary'
      className='py-20'
    />
  );
}
