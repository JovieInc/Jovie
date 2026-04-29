import { MarketingScreenshot } from '@/components/marketing/MarketingScreenshot';
import { Container } from '@/components/site/Container';
import { ClaimHandleForm } from './claim-handle';

export function HeroScrollSection() {
  return (
    <section className='relative overflow-hidden pb-0 pt-[5.5rem] md:pt-[6.1rem] lg:pt-[6.6rem] xl:pt-[6.9rem]'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />
      <div className='hero-glow pointer-events-none absolute inset-0' />

      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px]'>
          <div className='hero-stagger'>
            <div className='max-w-[44rem] text-center lg:text-left'>
              <p className='homepage-section-eyebrow'>
                Built for independent artists
              </p>

              <h1 className='marketing-h1-linear mt-5 max-w-[12ch] text-primary-token lg:text-left'>
                The link your music deserves.
              </h1>

              <p className='marketing-lead-linear mx-auto mt-4 max-w-[31rem] text-secondary-token md:mt-5 lg:mx-0'>
                Smart links, release automation, and fan insight that keep every
                launch moving.
              </p>

              <div className='mx-auto mt-6 w-full max-w-[27rem] md:mt-7 lg:mx-0'>
                <ClaimHandleForm size='hero' />
              </div>

              <p className='mt-3.5 text-[11px] tracking-[0.01em] text-quaternary-token md:mt-4 lg:text-left'>
                Start free with your artist page and next release ready to go.
              </p>
            </div>

            <div className='relative mt-10 w-full md:mt-13 lg:mt-15'>
              <div className='homepage-surface-card relative overflow-hidden rounded-[1rem] md:rounded-[1.1rem]'>
                <MarketingScreenshot
                  scenarioId='dashboard-releases-desktop'
                  altOverride='Jovie release dashboard showing releases table with smart link details'
                  width={2880}
                  height={1800}
                  title='Jovie'
                  priority
                  testId='hero-dashboard-screenshot'
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
