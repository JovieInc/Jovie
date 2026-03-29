import { MarketingContainer } from '@/components/marketing';
import { ClaimHandleForm } from '@/features/home/claim-handle';

export function LandingFinalCTA() {
  return (
    <section
      aria-labelledby='landing-final-cta-heading'
      className='section-glow section-glow-cta relative overflow-hidden'
      style={{
        borderTop: '1px solid var(--linear-border-subtle)',
        paddingTop: 'var(--linear-space-20)',
        paddingBottom: 'var(--linear-space-20)',
      }}
    >
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
        <div className='reveal-on-scroll relative mx-auto max-w-[32rem] text-center'>
          <h2
            id='landing-final-cta-heading'
            className='marketing-h2-linear text-primary-token'
          >
            Your next release starts here.
          </h2>

          <p className='mt-4 text-[15px] leading-[1.6] text-secondary-token sm:text-[16px]'>
            Claim your handle.
          </p>

          <div className='mx-auto mt-6 w-full max-w-[27rem]'>
            <ClaimHandleForm submitButtonTestId='landing-claim-submit' />
          </div>

          <p className='mt-4 text-[11px] tracking-[0.01em] text-quaternary-token'>
            Free forever.
          </p>
        </div>
      </MarketingContainer>
    </section>
  );
}
