import { MarketingContainer } from '@/components/marketing';
import { ClaimHandleForm } from './claim-handle';

export function FinalCTASection() {
  return (
    <section
      className='section-glow section-glow-cta relative z-10 overflow-hidden'
      style={{
        borderTop: '1px solid var(--linear-border-subtle)',
        paddingTop: 'var(--linear-cta-section-pt)',
        paddingBottom: 'var(--linear-cta-section-pb)',
      }}
    >
      {/* Orb glow behind headline */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2'
        style={{
          width: '600px',
          height: '400px',
          background:
            'radial-gradient(ellipse at center, oklch(18% 0.04 270 / 0.3), transparent 65%)',
          filter: 'blur(40px)',
        }}
      />
      <MarketingContainer width='landing'>
        <div className='reveal-on-scroll relative mx-auto max-w-[36rem] text-center'>
          <h2
            data-testid='final-cta-headline'
            className='marketing-h2-linear text-primary-token'
          >
            Claim your handle.
          </h2>

          <p className='marketing-lead-linear mt-4 text-secondary-token'>
            Your next release does the rest.
          </p>

          <div
            data-testid='final-cta-form'
            className='mx-auto mt-7 w-full max-w-[27rem]'
          >
            <ClaimHandleForm />
          </div>

          <p className='mt-5 text-[11px] tracking-[0.01em] text-quaternary-token'>
            Join 500+ independent artists already on Jovie.
          </p>
        </div>
      </MarketingContainer>
    </section>
  );
}
