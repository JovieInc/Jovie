import { Container } from '@/components/site/Container';
import { ClaimHandleForm } from './claim-handle';
import { ProductScreenshot } from './ProductScreenshot';

export function HeroScrollSection() {
  return (
    <section className='relative overflow-hidden pb-0 pt-[6.25rem] md:pt-[7rem] lg:pt-[7.5rem] xl:pt-[8rem]'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />
      <div className='hero-glow pointer-events-none absolute inset-0' />

      <Container size='homepage'>
        <div className='mx-auto max-w-[var(--linear-hero-shell-max)]'>
          <div className='hero-stagger'>
            <div className='max-w-[48rem] text-center lg:text-left'>
              <p className='marketing-kicker justify-center lg:justify-start'>
                Release more music. Do less release work.
              </p>

              <h1 className='marketing-h1-linear mt-6 max-w-[11ch] text-primary-token lg:text-left'>
                The link your music deserves.
              </h1>

              <p className='marketing-lead-linear mx-auto mt-5 max-w-[36rem] text-secondary-token md:mt-6 lg:mx-0'>
                Smart links, release automation, and fan intelligence for
                independent artists. One system to launch, convert, and follow
                up without stitching tools together.
              </p>

              <div className='mx-auto mt-7 w-full max-w-[29rem] md:mt-8 lg:mx-0'>
                <ClaimHandleForm size='display' />
              </div>

              <p className='mt-4 text-[length:var(--linear-label-size)] tracking-[0.01em] text-tertiary-token md:mt-4.5 lg:text-left'>
                Start free with smart links, your artist profile, and release
                workflows ready for the next drop.
              </p>
            </div>

            <div className='relative mt-12 w-full md:mt-16 lg:mt-18'>
              <div className='homepage-surface-card relative overflow-hidden rounded-[1rem] md:rounded-[1.1rem]'>
                <ProductScreenshot
                  src='/product-screenshots/releases-dashboard-sidebar.png'
                  alt='Jovie release dashboard showing releases table with sidebar open'
                  width={2880}
                  height={1800}
                  title='Jovie'
                  priority
                />
                {/* Gentle bottom fade — subtle, not aggressive */}
                <div
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-x-0 bottom-0 h-16 md:h-20'
                  style={{
                    background:
                      'linear-gradient(180deg, transparent 0%, rgba(8,9,10,0.44) 70%, var(--linear-bg-page) 100%)',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
