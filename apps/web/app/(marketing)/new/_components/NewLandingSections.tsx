import { BarChart3, BellRing, Sparkles, Users } from 'lucide-react';
import Image from 'next/image';
import {
  MarketingContainer,
  MarketingMetricCard,
  MarketingSectionIntro,
  MarketingSurfaceCard,
} from '@/components/marketing';
import { PhoneFrame } from '@/features/home/PhoneFrame';
import { ProductScreenshot } from '@/features/home/ProductScreenshot';

interface LandingStep {
  readonly number: string;
  readonly label: string;
  readonly description: string;
}

const STEPS: readonly LandingStep[] = [
  {
    number: '01',
    label: 'Claim your handle',
    description:
      'Start with a clean artist home that already looks like a finished product.',
  },
  {
    number: '02',
    label: 'Connect Spotify',
    description:
      'Bring in your catalog once so the release system knows what to publish and where.',
  },
  {
    number: '03',
    label: 'Release',
    description:
      'Every drop gets the same sharp launch flow without rebuilding the stack each time.',
  },
] as const;

const RELEASE_PROOF_POINTS = [
  {
    label: 'Imported automatically',
    testId: 'landing-release-proof-imported',
  },
  {
    label: 'Fans notified',
    testId: 'landing-release-proof-fans-notified',
  },
] as const;

const PROFILE_PROOF_POINTS = [
  {
    label: 'Own every contact',
    testId: 'landing-profile-proof-owned-contacts',
  },
  {
    label: 'See what brought them in',
    testId: 'landing-profile-proof-top-source',
  },
] as const;

export function NewLandingSections() {
  return (
    <>
      <section
        aria-labelledby='landing-how-it-works-heading'
        className='section-spacing-linear-sm'
      >
        <MarketingContainer width='page'>
          <div className='homepage-section-shell'>
            <div>
              <p className='homepage-section-eyebrow'>Set up once</p>
              <h2
                id='landing-how-it-works-heading'
                className='marketing-h2-linear mt-5 max-w-[12ch] text-primary-token'
              >
                One system from first setup to release day.
              </h2>
              <p className='mt-4 max-w-[38rem] text-[15px] leading-[1.65] text-secondary-token sm:text-[16px]'>
                Jovie should feel like the same calm, premium workspace on the
                public side and inside the product. These are the three moves
                that make that true.
              </p>
            </div>

            <div className='homepage-section-stack'>
              <div className='homepage-surface-card overflow-hidden rounded-[1rem]'>
                <div className='grid gap-px bg-surface-1/60 md:grid-cols-3'>
                  {STEPS.map(step => (
                    <div
                      key={step.number}
                      className='bg-surface-0 px-5 py-5 sm:px-6 sm:py-6'
                    >
                      <p className='text-[11px] font-medium uppercase tracking-[0.18em] text-secondary-token'>
                        {step.number}
                      </p>
                      <h3 className='mt-3 text-[1rem] font-medium tracking-[-0.02em] text-primary-token sm:text-[1.05rem]'>
                        {step.label}
                      </h3>
                      <p className='mt-3 max-w-[18rem] text-[13px] leading-5 text-tertiary-token'>
                        {step.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </MarketingContainer>
      </section>

      <section
        aria-labelledby='landing-release-heading'
        className='section-spacing-linear-sm relative overflow-hidden'
        data-testid='landing-release-section'
      >
        <MarketingContainer width='page'>
          <div className='homepage-section-shell'>
            <MarketingSectionIntro
              eyebrow='Release automation'
              title='Release day, automated.'
              titleId='landing-release-heading'
              titleClassName='max-w-[11ch]'
              description='Jovie should remove launch busywork, not decorate it. The proof is a cleaner release workspace, a faster smart-link flow, and less manual work every time music drops.'
              badges={RELEASE_PROOF_POINTS}
              asideClassName='grid gap-3 sm:grid-cols-2 lg:justify-self-end'
              aside={
                <>
                  <MarketingMetricCard
                    icon={
                      <Sparkles className='h-3.5 w-3.5 text-primary-token' />
                    }
                    label='Imported automatically'
                    value='6 DSPs live'
                    description='Links ready the moment the release lands.'
                  />
                  <MarketingMetricCard
                    icon={
                      <BellRing className='h-3.5 w-3.5 text-primary-token' />
                    }
                    label='Fans notified'
                    value='482'
                    valueAside='41.3% click rate'
                    description='The launch message goes out with the release instead of after it.'
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
                  priority
                  skipCheck
                  testId='landing-release-screenshot'
                  className='rounded-[1.15rem]'
                />
              </MarketingSurfaceCard>
            </div>
          </div>
        </MarketingContainer>
      </section>

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
              badges={PROFILE_PROOF_POINTS}
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
                            src='/product-screenshots/tim-white-profile-listen-phone.png'
                            alt='Mobile artist profile preview with fan actions and listening destinations'
                            fill
                            priority
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
                            src='/product-screenshots/tim-white-profile-listen-phone.png'
                            alt='Mobile artist profile preview with fan actions and listening destinations'
                            fill
                            priority
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
    </>
  );
}
