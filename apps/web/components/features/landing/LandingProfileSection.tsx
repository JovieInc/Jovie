import { BarChart3, Users } from 'lucide-react';
import Image from 'next/image';
import { Container } from '@/components/site/Container';
import { PhoneFrame } from '@/features/home/PhoneFrame';

const PROOF_POINTS = ['Own every contact', 'See what brought them in'] as const;

export function LandingProfileSection() {
  return (
    <section
      aria-labelledby='landing-profile-heading'
      className='section-spacing-linear-sm relative overflow-hidden'
    >
      <Container size='homepage'>
        <div className='homepage-section-shell mx-auto max-w-[1120px]'>
          <div className='homepage-section-intro-compact reveal-on-scroll'>
            <div>
              <p className='homepage-section-eyebrow'>Artist profile</p>
              <h2
                id='landing-profile-heading'
                className='marketing-h2-linear mt-5 max-w-[9ch] text-primary-token'
              >
                One page. Every fan.
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
            <div className='homepage-surface-card relative overflow-hidden rounded-[1rem] p-4 sm:p-5 lg:p-6'>
              <div
                aria-hidden='true'
                className='pointer-events-none absolute left-10 top-0 h-40 w-56 blur-3xl'
                style={{
                  background:
                    'radial-gradient(circle at center, rgba(76,177,255,0.14), transparent 72%)',
                }}
              />

              <div className='relative overflow-hidden rounded-[1rem] border border-subtle bg-surface-0 px-3 pt-3 sm:px-5 sm:pt-5 lg:px-6 lg:pt-6'>
                <div className='relative'>
                  <div className='rounded-t-[1rem] border border-subtle overflow-hidden'>
                    <Image
                      src='/product-screenshots/profile-desktop.png'
                      alt='Desktop artist profile showing smart links, fan capture, tour dates, and tipping'
                      width={2880}
                      height={1800}
                      sizes='(min-width: 1280px) 900px, (min-width: 768px) 78vw, 100vw'
                      className='h-auto w-full'
                    />
                  </div>

                  <div className='pointer-events-none absolute left-4 top-4 hidden w-[14rem] rounded-[1rem] border border-subtle bg-[rgba(10,11,16,0.84)] p-4 shadow-[0_24px_55px_rgba(0,0,0,0.32)] backdrop-blur-xl md:block'>
                    <div className='flex items-center gap-2 text-[12px] font-medium text-secondary-token'>
                      <Users className='h-3.5 w-3.5 text-primary-token' />
                      Audience signal
                    </div>
                    <p className='mt-2 text-[1.55rem] font-medium tracking-[-0.04em] text-primary-token'>
                      4,218
                    </p>
                    <p className='mt-1 text-[12px] text-tertiary-token'>
                      owned contacts
                    </p>
                    <div className='mt-3 grid gap-2 border-t border-subtle pt-3 text-[12px] text-secondary-token'>
                      <div className='flex items-center justify-between gap-3'>
                        <span>IG / social</span>
                        <span className='text-primary-token'>38%</span>
                      </div>
                      <div className='flex items-center justify-between gap-3'>
                        <span>Direct</span>
                        <span className='text-primary-token'>25%</span>
                      </div>
                    </div>
                  </div>

                  <div className='pointer-events-none absolute bottom-4 right-4 hidden drop-shadow-[0_25px_60px_rgba(0,0,0,0.34)] sm:block lg:right-8'>
                    <PhoneFrame className='h-[440px] w-[210px] lg:h-[500px] lg:w-[238px]'>
                      <Image
                        src='/product-screenshots/profile-phone.png'
                        alt='Mobile artist profile preview with fan actions and listening destinations'
                        width={780}
                        height={1688}
                        sizes='(min-width: 1280px) 238px, 210px'
                        className='h-full w-full object-cover object-top'
                      />
                    </PhoneFrame>
                  </div>
                </div>

                <div className='grid gap-3 border-t border-subtle px-1 py-4 sm:hidden'>
                  <div className='mx-auto drop-shadow-[0_22px_48px_rgba(0,0,0,0.32)]'>
                    <PhoneFrame className='h-[360px] w-[172px]'>
                      <Image
                        src='/product-screenshots/profile-phone.png'
                        alt='Mobile artist profile preview with fan actions and listening destinations'
                        width={780}
                        height={1688}
                        sizes='172px'
                        className='h-full w-full object-cover object-top'
                      />
                    </PhoneFrame>
                  </div>

                  <div className='rounded-[0.95rem] border border-subtle bg-[rgba(10,11,16,0.82)] px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl'>
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

                  <div className='rounded-[0.95rem] border border-subtle bg-[rgba(10,11,16,0.82)] px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl'>
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
