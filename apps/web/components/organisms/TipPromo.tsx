'use client';
import { CTASection } from '@/components/organisms/CTASection';
import { publicEnv } from '@/lib/env-public';

export default function TipPromo() {
  if (publicEnv.NEXT_PUBLIC_FEATURE_TIPS !== 'true') return null;

  return (
    <CTASection
      title={
        <>
          Tip, <span className='text-indigo-400'>instantly.</span>
        </>
      }
      description={
        <>
          Fans tap once, you get paid. No sign-ups, no fees,{' '}
          <br className='hidden sm:inline' />
          just pure support—directly in Venmo.
        </>
      }
      buttonText='See it live'
      buttonHref='/tim/tip'
      variant='secondary'
      className='py-20'
    />
  );
}
