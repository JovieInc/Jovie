import { BarChart3, Users } from 'lucide-react';
import { Container } from '@/components/site/Container';
import { PhoneFrame } from '@/features/home/PhoneFrame';

const PROOF_POINTS = [
  {
    label: 'Own every contact',
    testId: 'landing-profile-proof-owned-contacts',
  },
  {
    label: 'See what brought them in',
    testId: 'landing-profile-proof-top-source',
  },
] as const;

export function LandingProfileSection() {
  return (
    <section
      aria-labelledby='landing-profile-heading'
      className='section-spacing-linear-sm relative overflow-hidden'
      data-testid='landing-profile-section'
    >
      <Container size='homepage'>
        <div className='homepage-section-shell mx-auto max-w-[1120px]'>
          <div className='homepage-section-intro'>
            <div className='homepage-section-copy'>
              <p className='homepage-section-eyebrow'>Artist profile</p>
              <h2
                id='landing-profile-heading'
                className='marketing-h2-linear mt-5 max-w-[10ch] text-primary-token'
              >
                One page. Every fan.
              </h2>
              <p className='mt-4 max-w-[34rem] text-[15px] leading-[1.65] text-secondary-token sm:text-[16px]'>
                The public artist page should feel like the product already
                solved the problem. Clean destination, clear actions, and
                audience signal that does not make the artist look like they
                stitched together five tools.
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
                  <Users className='h-3.5 w-3.5 text-primary-token' />
                  Audience signal
                </div>
                <p className='mt-2 text-[1.45rem] font-medium tracking-[-0.04em] text-primary-token'>
                  4,218
                </p>
                <p className='mt-1 text-[12px] leading-5 text-tertiary-token'>
                  Owned contacts, not borrowed followers.
                </p>
              </div>
              <div className='homepage-surface-card rounded-[1rem] px-4 py-3.5'>
                <div className='flex items-center gap-2 text-[12px] font-medium text-secondary-token'>
                  <BarChart3 className='h-3.5 w-3.5 text-primary-token' />
                  Top source
                </div>
                <div className='mt-2 flex items-end justify-between gap-4'>
                  <p className='text-[1.45rem] font-medium tracking-[-0.04em] text-primary-token'>
                    IG / social
                  </p>
                  <p className='pb-1 text-[12px] text-tertiary-token'>38%</p>
                </div>
                <p className='mt-1 text-[12px] leading-5 text-tertiary-token'>
                  See which channel actually drives the fan relationship.
                </p>
              </div>
            </div>
          </div>

          <div className='homepage-section-stack'>
            <div className='homepage-surface-card relative overflow-hidden rounded-[1rem] p-4 sm:p-5 lg:p-6'>
              <div
                aria-hidden='true'
                className='pointer-events-none absolute left-10 top-0 h-40 w-56 blur-3xl'
                style={{
                  background:
                    'radial-gradient(circle at center, rgba(76,177,255,0.14), transparent 72%)',
                }}
              />

              <div className='relative overflow-hidden rounded-[1rem] border border-subtle bg-surface-0 px-3 pb-3 pt-3 sm:px-5 sm:pb-5 sm:pt-5 lg:px-6 lg:pb-6 lg:pt-6'>
                <div className='relative'>
                  <figure
                    aria-label='Desktop artist profile showing smart links, fan capture, tour dates, and tipping'
                    data-testid='landing-profile-desktop-screenshot'
                    className='overflow-hidden rounded-[1rem] border border-subtle bg-surface-0 shadow-[0_28px_70px_rgba(0,0,0,0.28),0_10px_22px_rgba(0,0,0,0.18)]'
                  >
                    <img
                      src='/product-screenshots/profile-desktop.png'
                      alt='Desktop artist profile showing smart links, fan capture, tour dates, and tipping'
                      className='h-auto w-full'
                    />
                  </figure>

                  <div className='pointer-events-none absolute bottom-4 right-4 hidden drop-shadow-[0_25px_60px_rgba(0,0,0,0.34)] sm:block lg:right-8'>
                    <PhoneFrame className='h-[440px] w-[210px] lg:h-[500px] lg:w-[238px]'>
                      <img
                        src='/product-screenshots/profile-phone.png'
                        alt='Mobile artist profile preview with fan actions and listening destinations'
                        className='h-full w-full object-cover object-top'
                      />
                    </PhoneFrame>
                  </div>
                </div>

                <div className='grid gap-3 border-t border-subtle px-1 py-4 sm:hidden'>
                  <div className='mx-auto drop-shadow-[0_22px_48px_rgba(0,0,0,0.32)]'>
                    <PhoneFrame className='h-[360px] w-[172px]'>
                      <img
                        src='/product-screenshots/profile-phone.png'
                        alt='Mobile artist profile preview with fan actions and listening destinations'
                        className='h-full w-full object-cover object-top'
                      />
                    </PhoneFrame>
                  </div>

                  <div className='grid gap-3 sm:grid-cols-2'>
                    <div className='homepage-surface-card rounded-[0.95rem] px-4 py-3'>
                      <div className='flex items-center gap-2 text-[12px] font-medium text-secondary-token'>
                        <Users className='h-3.5 w-3.5 text-primary-token' />
                        Audience signal
                      </div>
                      <div className='mt-2 flex items-end justify-between gap-4'>
                        <p className='text-[1.35rem] font-medium tracking-[-0.04em] text-primary-token'>
                          4,218
                        </p>
                        <p className='text-[12px] text-tertiary-token'>
                          owned contacts
                        </p>
                      </div>
                    </div>

                    <div className='homepage-surface-card rounded-[0.95rem] px-4 py-3'>
                      <div className='flex items-center gap-2 text-[12px] font-medium text-secondary-token'>
                        <BarChart3 className='h-3.5 w-3.5 text-primary-token' />
                        Top source
                      </div>
                      <div className='mt-2 flex items-end justify-between gap-4'>
                        <p className='text-[1.35rem] font-medium tracking-[-0.04em] text-primary-token'>
                          IG / social
                        </p>
                        <p className='text-[12px] text-tertiary-token'>38%</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className='pointer-events-none absolute bottom-6 right-6 hidden text-[12px] text-tertiary-token lg:block'>
                  Mobile profile preview
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
