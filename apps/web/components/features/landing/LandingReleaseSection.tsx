import { BellRing, Sparkles } from 'lucide-react';
import { Container } from '@/components/site/Container';
import { ProductScreenshot } from '@/features/home/ProductScreenshot';

const PROOF_POINTS = [
  {
    label: 'Imported automatically',
    testId: 'landing-release-proof-imported',
  },
  {
    label: 'Fans notified',
    testId: 'landing-release-proof-fans-notified',
  },
] as const;

export function LandingReleaseSection() {
  return (
    <section
      aria-labelledby='landing-release-heading'
      className='section-spacing-linear-sm relative overflow-hidden'
      data-testid='landing-release-section'
    >
      <Container size='homepage'>
        <div className='homepage-section-shell mx-auto max-w-[1120px]'>
          <div className='homepage-section-intro'>
            <div className='homepage-section-copy'>
              <p className='homepage-section-eyebrow'>Release automation</p>
              <h2
                id='landing-release-heading'
                className='marketing-h2-linear mt-5 max-w-[11ch] text-primary-token'
              >
                Release day, automated.
              </h2>
              <p className='mt-4 max-w-[34rem] text-[15px] leading-[1.65] text-secondary-token sm:text-[16px]'>
                Jovie should remove launch busywork, not decorate it. The proof
                is a cleaner release workspace, a faster smart-link flow, and
                less manual work every time music drops.
              </p>

              <div className='mt-5 flex flex-wrap gap-2.5'>
                {PROOF_POINTS.map(point => (
                  <span
                    key={point.label}
                    data-testid={point.testId}
                    className='inline-flex items-center rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-[12px] font-medium tracking-[-0.01em] text-secondary-token'
                  >
                    {point.label}
                  </span>
                ))}
              </div>
            </div>

            <div className='grid gap-3 sm:grid-cols-2 lg:justify-self-end'>
              <div className='homepage-surface-card rounded-[1rem] px-4 py-3.5'>
                <div className='flex items-center gap-2 text-[12px] font-medium text-secondary-token'>
                  <Sparkles className='h-3.5 w-3.5 text-primary-token' />
                  Imported automatically
                </div>
                <p className='mt-2 text-[1.45rem] font-medium tracking-[-0.04em] text-primary-token'>
                  6 DSPs live
                </p>
                <p className='mt-1 text-[12px] leading-5 text-tertiary-token'>
                  Links ready the moment the release lands.
                </p>
              </div>
              <div className='homepage-surface-card rounded-[1rem] px-4 py-3.5'>
                <div className='flex items-center gap-2 text-[12px] font-medium text-secondary-token'>
                  <BellRing className='h-3.5 w-3.5 text-primary-token' />
                  Fans notified
                </div>
                <div className='mt-2 flex items-end justify-between gap-4'>
                  <p className='text-[1.45rem] font-medium tracking-[-0.04em] text-primary-token'>
                    482
                  </p>
                  <p className='pb-1 text-[12px] text-tertiary-token'>
                    41.3% click rate
                  </p>
                </div>
                <p className='mt-1 text-[12px] leading-5 text-tertiary-token'>
                  The launch message goes out with the release instead of after
                  it.
                </p>
              </div>
            </div>
          </div>

          <div className='homepage-section-stack'>
            <div className='homepage-surface-card relative overflow-hidden rounded-[1rem] p-4 sm:p-5 lg:p-6'>
              <div
                aria-hidden='true'
                className='pointer-events-none absolute inset-x-16 top-0 h-40 blur-3xl'
                style={{
                  background:
                    'radial-gradient(circle at center, rgba(94,106,210,0.18), transparent 72%)',
                }}
              />

              <ProductScreenshot
                src='/product-screenshots/releases-dashboard-sidebar.png'
                alt='Release detail dashboard showing a smart link sidebar, release automation, and platform destinations'
                width={2880}
                height={1800}
                title='Release workspace'
                chrome='minimal'
                skipCheck
                testId='landing-release-screenshot'
                className='rounded-[1.15rem]'
              />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
