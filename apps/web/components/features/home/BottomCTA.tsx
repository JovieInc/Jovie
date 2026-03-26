import Link from 'next/link';
import { MarketingContainer } from '@/components/marketing';

export function BottomCTA() {
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
          <h2 className='marketing-h2-linear text-primary-token'>
            Your next release is ready before you are.
          </h2>

          <p className='marketing-lead-linear mt-4 text-secondary-token'>
            Smart links, fan notifications, playlist pitches — automated for
            every drop. Release more, learn what resonates, find your sound.
          </p>

          <div className='mt-7 flex justify-center'>
            <Link
              href='/signup'
              className='btn-linear-signup focus-ring-themed'
              style={{
                height: '2.75rem',
                padding: '0 1.75rem',
                fontSize: '15px',
                borderRadius: '6px',
              }}
            >
              Get Started
            </Link>
          </div>

          <p className='mt-5 text-[11px] tracking-[0.01em] text-quaternary-token'>
            Join 500+ independent artists already on Jovie.
          </p>
        </div>
      </MarketingContainer>
    </section>
  );
}
