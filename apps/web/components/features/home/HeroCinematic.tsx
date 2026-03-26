import { Container } from '@/components/site/Container';
import { ClaimHandleForm } from './claim-handle';
import { MODES, PhoneShowcase } from './phone-showcase-primitives';

interface HeroCinematicProps {
  /** When true, hero fills the viewport with no scroll and handles all breakpoints. */
  readonly fullScreen?: boolean;
}

export function HeroCinematic({ fullScreen = false }: HeroCinematicProps) {
  return (
    <section
      className={
        fullScreen
          ? 'relative flex items-center overflow-hidden h-[calc(100dvh-var(--linear-header-height))]'
          : 'relative overflow-hidden pb-0 pt-[5.5rem] md:pt-[6.1rem] lg:hidden'
      }
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />
      <div className='hero-glow pointer-events-none absolute inset-0' />

      <Container size='homepage'>
        <div className='mx-auto max-w-[1120px]'>
          <div className='hero-stagger'>
            <div
              className={
                fullScreen
                  ? 'flex flex-col items-center gap-8 lg:grid lg:grid-cols-2 lg:items-center lg:gap-16'
                  : 'flex flex-col items-center gap-10 lg:flex-row lg:items-center lg:gap-16'
              }
            >
              {/* Left: Copy + Claim Form */}
              <div className='max-w-[44rem] text-center lg:flex-1 lg:text-left'>
                <p className='homepage-section-eyebrow'>
                  Built for independent artists
                </p>

                <h1 className='marketing-h1-linear hero-gradient-text mt-5 lg:text-left'>
                  The link your music deserves.
                </h1>

                <p className='marketing-lead-linear mx-auto mt-4 max-w-[31rem] text-secondary-token md:mt-5 lg:mx-0'>
                  Smart links, release automation, and fan insight that keep
                  every launch moving.
                </p>

                <div className='mx-auto mt-6 w-full max-w-[27rem] md:mt-7 lg:mx-0'>
                  <ClaimHandleForm size='hero' />
                </div>

                <p className='mt-3.5 text-[11px] tracking-[0.01em] text-quaternary-token md:mt-4 lg:text-left'>
                  Start free with your artist page and next release ready to go.
                </p>
              </div>

              {/* Right: Phone */}
              <div
                className={
                  fullScreen
                    ? 'relative flex items-center justify-center min-h-0 flex-1 lg:flex-none'
                    : 'relative flex-shrink-0 lg:flex-none'
                }
              >
                <div
                  className='animate-hero-phone-float'
                  style={{
                    filter:
                      'drop-shadow(0 25px 60px rgba(0,0,0,0.35)) drop-shadow(0 8px 30px rgba(94,106,210,0.15))',
                  }}
                >
                  <PhoneShowcase activeIndex={0} modes={MODES} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
