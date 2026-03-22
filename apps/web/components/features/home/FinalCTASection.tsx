'use client';

import Link from 'next/link';
import { MarketingContainer } from '@/components/marketing';
import { ClaimHandleForm } from './claim-handle';

export function FinalCTASection() {
  return (
    <section
      className='relative z-10 overflow-hidden'
      style={{
        borderTop: '1px solid var(--linear-border-subtle)',
        paddingTop: 'var(--linear-cta-section-pt)',
        paddingBottom: 'var(--linear-cta-section-pb)',
      }}
    >
      <MarketingContainer width='landing'>
        <div className='reveal-on-scroll relative mx-auto flex max-w-[42rem] flex-col items-center text-center'>
          <h2
            data-testid='final-cta-headline'
            className='marketing-h2-linear text-primary-token'
          >
            Take the stage.
          </h2>

          <p className='mt-3.5 max-w-[32rem] marketing-lead-linear text-secondary-token'>
            Claim your handle and start releasing.
          </p>

          {/* Form */}
          <div className='mt-5 w-full max-w-[32rem] md:mt-6'>
            <div
              id='final-cta-dock'
              data-testid='final-cta-dock'
              className='homepage-surface-card relative w-full overflow-hidden rounded-[1rem] p-2'
              style={{
                borderColor: 'var(--linear-border-default)',
              }}
            >
              <ClaimHandleForm />
            </div>
          </div>

          {/* Buttons */}
          <div className='mt-5 flex items-center gap-3'>
            <Link
              href='/pricing'
              className='rounded-[4px] px-4 py-2 text-[13px] font-[510] transition-colors'
              style={{
                backgroundColor: '#e6e6e6',
                color: '#08090a',
              }}
            >
              Get started
            </Link>
            <Link
              href='/support'
              className='rounded-[4px] border px-4 py-2 text-[13px] font-[510] transition-colors'
              style={{
                borderColor: 'var(--linear-border-default)',
                color: 'var(--linear-text-secondary)',
              }}
            >
              Contact us
            </Link>
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}
