import { BellRing, Sparkles } from 'lucide-react';
import Image from 'next/image';
import { Container } from '@/components/site/Container';

const PROOF_POINTS = ['Imported automatically', 'Fans notified'] as const;

export function LandingReleaseSection() {
  return (
    <section
      aria-labelledby='landing-release-heading'
      className='section-spacing-linear-sm relative overflow-hidden'
    >
      <Container size='homepage'>
        <div className='homepage-section-shell mx-auto max-w-[1120px]'>
          <div className='homepage-section-intro-compact reveal-on-scroll'>
            <div>
              <p className='homepage-section-eyebrow'>Release automation</p>
              <h2
                id='landing-release-heading'
                className='marketing-h2-linear mt-5 max-w-[10ch] text-primary-token'
              >
                Release day, automated.
              </h2>

              <div className='mt-5 flex flex-wrap gap-2.5'>
                {PROOF_POINTS.map(point => (
                  <span
                    key={point}
                    className='inline-flex items-center rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-[12px] font-medium tracking-[-0.01em] text-secondary-token'
                  >
                    {point}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div
            className='homepage-section-stack reveal-on-scroll'
            data-delay='80'
          >
            <div className='homepage-surface-card relative overflow-hidden rounded-[1rem] p-3 sm:p-4 lg:p-5'>
              <div
                aria-hidden='true'
                className='pointer-events-none absolute inset-x-16 top-0 h-40 blur-3xl'
                style={{
                  background:
                    'radial-gradient(circle at center, rgba(94,106,210,0.18), transparent 72%)',
                }}
              />

              <div className='relative overflow-hidden rounded-[0.95rem] border border-subtle'>
                <Image
                  src='/product-screenshots/releases-dashboard-sidebar.png'
                  alt='Release detail dashboard showing a smart link sidebar, release automation, and platform destinations'
                  width={2880}
                  height={1800}
                  sizes='(min-width: 1280px) 960px, (min-width: 768px) 80vw, 100vw'
                  className='h-auto w-full'
                />
              </div>

              <div className='mt-4 grid gap-3 md:hidden'>
                <div className='rounded-[0.95rem] border border-subtle bg-[rgba(12,14,20,0.82)] px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl'>
                  <div className='flex items-center gap-2 text-[12px] font-medium text-secondary-token'>
                    <Sparkles className='h-3.5 w-3.5 text-primary-token' />
                    Imported automatically
                  </div>
                  <p className='mt-2 text-[1.2rem] font-medium tracking-[-0.03em] text-primary-token'>
                    6 DSPs live
                  </p>
                </div>

                <div className='rounded-[0.95rem] border border-subtle bg-[rgba(12,14,20,0.82)] px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl'>
                  <div className='flex items-center gap-2 text-[12px] font-medium text-secondary-token'>
                    <BellRing className='h-3.5 w-3.5 text-primary-token' />
                    Fans notified
                  </div>
                  <div className='mt-2 flex items-end justify-between gap-4'>
                    <p className='text-[1.35rem] font-medium tracking-[-0.03em] text-primary-token'>
                      482
                    </p>
                    <p className='text-[12px] text-tertiary-token'>
                      41.3% click rate
                    </p>
                  </div>
                </div>
              </div>

              <div className='pointer-events-none absolute right-8 top-8 hidden w-[13rem] rounded-[1rem] border border-subtle bg-[rgba(10,11,16,0.82)] p-4 shadow-[0_24px_55px_rgba(0,0,0,0.32)] backdrop-blur-xl md:block'>
                <div className='flex items-center gap-2 text-[12px] font-medium text-secondary-token'>
                  <Sparkles className='h-3.5 w-3.5 text-primary-token' />
                  Imported automatically
                </div>
                <p className='mt-2 text-[1.5rem] font-medium tracking-[-0.04em] text-primary-token'>
                  6 DSPs live
                </p>
                <p className='mt-1 text-[12px] text-tertiary-token'>
                  Links ready the moment the release lands.
                </p>
              </div>

              <div className='pointer-events-none absolute bottom-8 left-8 hidden w-[15rem] rounded-[1rem] border border-subtle bg-[rgba(10,11,16,0.82)] p-4 shadow-[0_24px_55px_rgba(0,0,0,0.32)] backdrop-blur-xl md:block'>
                <div className='flex items-center gap-2 text-[12px] font-medium text-secondary-token'>
                  <BellRing className='h-3.5 w-3.5 text-primary-token' />
                  Fans notified
                </div>
                <div className='mt-3 flex items-end justify-between gap-4'>
                  <p className='text-[1.7rem] font-medium tracking-[-0.05em] text-primary-token'>
                    482
                  </p>
                  <p className='pb-1 text-[12px] text-tertiary-token'>
                    41.3% click rate
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
