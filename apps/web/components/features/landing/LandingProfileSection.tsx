import { BarChart3, Users } from 'lucide-react';
import Image from 'next/image';
import {
  MarketingContainer,
  MarketingMetricCard,
  MarketingSectionIntro,
  MarketingSurfaceCard,
} from '@/components/marketing';
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
      <MarketingContainer width='page'>
        <div className='homepage-section-shell'>
          <MarketingSectionIntro
            eyebrow='Artist profile'
            title='One page. Every fan.'
            titleId='landing-profile-heading'
            titleClassName='max-w-[10ch]'
            description='The public artist page should feel like the product already solved the problem. Clean destination, clear actions, and audience signal that does not make the artist look like they stitched together five tools.'
            badges={PROOF_POINTS}
            asideClassName='grid gap-3 sm:grid-cols-2 lg:justify-self-end'
            aside={
              <>
                <MarketingMetricCard
                  icon={<Users className='h-3.5 w-3.5 text-primary-token' />}
                  label='Audience signal'
                  value='4,218'
                  description='Owned contacts, not borrowed followers.'
                />
                <MarketingMetricCard
                  icon={
                    <BarChart3 className='h-3.5 w-3.5 text-primary-token' />
                  }
                  label='Top source'
                  value='IG / social'
                  valueAside='38%'
                  description='See which channel actually drives the fan relationship.'
                />
              </>
            }
          />

          <div className='homepage-section-stack'>
            <MarketingSurfaceCard
              className='relative p-4 sm:p-5 lg:p-6'
              glowTone='none'
            >
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
                    <Image
                      src='/product-screenshots/profile-desktop.png'
                      alt='Desktop artist profile showing smart links, fan capture, tour dates, and tipping'
                      width={2880}
                      height={1800}
                      sizes='(max-width: 1024px) 100vw, 900px'
                      className='h-auto w-full'
                    />
                  </figure>

                  <div className='pointer-events-none absolute bottom-4 right-4 hidden drop-shadow-[0_25px_60px_rgba(0,0,0,0.34)] sm:block lg:right-8'>
                    <PhoneFrame className='h-[440px] w-[210px] lg:h-[500px] lg:w-[238px]'>
                      <div className='relative h-full w-full'>
                        <Image
                          src='/product-screenshots/profile-phone.png'
                          alt='Mobile artist profile preview with fan actions and listening destinations'
                          fill
                          sizes='238px'
                          className='object-cover object-top'
                        />
                      </div>
                    </PhoneFrame>
                  </div>
                </div>

                <div className='grid gap-3 border-t border-subtle px-1 py-4 sm:hidden'>
                  <div className='mx-auto drop-shadow-[0_22px_48px_rgba(0,0,0,0.32)]'>
                    <PhoneFrame className='h-[360px] w-[172px]'>
                      <div className='relative h-full w-full'>
                        <Image
                          src='/product-screenshots/profile-phone.png'
                          alt='Mobile artist profile preview with fan actions and listening destinations'
                          fill
                          sizes='172px'
                          className='object-cover object-top'
                        />
                      </div>
                    </PhoneFrame>
                  </div>

                  <div className='grid gap-3 sm:grid-cols-2'>
                    <MarketingMetricCard
                      icon={
                        <Users className='h-3.5 w-3.5 text-primary-token' />
                      }
                      label='Audience signal'
                      value='4,218'
                      valueAside='owned contacts'
                      className='rounded-[0.95rem] px-4 py-3'
                      valueClassName='text-[1.35rem]'
                      valueAsideClassName='pb-0'
                    />

                    <MarketingMetricCard
                      icon={
                        <BarChart3 className='h-3.5 w-3.5 text-primary-token' />
                      }
                      label='Top source'
                      value='IG / social'
                      valueAside='38%'
                      className='rounded-[0.95rem] px-4 py-3'
                      valueClassName='text-[1.35rem]'
                      valueAsideClassName='pb-0'
                    />
                  </div>
                </div>

                <div className='pointer-events-none absolute bottom-6 right-6 hidden text-[12px] text-tertiary-token lg:block'>
                  Mobile profile preview
                </div>
              </div>
            </MarketingSurfaceCard>
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}
