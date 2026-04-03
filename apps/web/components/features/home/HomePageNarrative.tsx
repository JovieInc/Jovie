import { BellRing } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { APP_ROUTES } from '@/constants/routes';
import { ArtistProfileModesShowcase } from '@/features/home/ArtistProfileModesShowcase';
import { HomeHeroSurfaceCluster } from '@/features/home/HomeHeroSurfaceCluster';
import { HomepageLabelLogoMark } from '@/features/home/HomepageLabelLogoMark';
import {
  HOME_RELEASE_DESTINATION_LIVE_MOCK,
  HOME_RELEASE_DESTINATION_PRESAVE_MOCK,
  type HomepageLabelPartner,
} from '@/features/home/home-surface-seed';
import { ReleaseModeMockCard } from '@/features/home/ReleaseModeMockCard';
import { ReleaseOperatingSystemShowcase } from '@/features/home/ReleaseOperatingSystemShowcase';

const TRUST_LABELS: readonly HomepageLabelPartner[] = [
  'orchard',
  'awal',
  'umg',
  'armada',
] as const;

interface SectionHeaderProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
}

function SectionHeader({ eyebrow, title, body }: Readonly<SectionHeaderProps>) {
  return (
    <div className='max-w-[34rem]'>
      <p className='homepage-section-eyebrow'>{eyebrow}</p>
      <h2 className='marketing-h2-linear mt-4 text-primary-token'>{title}</h2>
      <p className='mt-4 max-w-[32rem] text-[15px] leading-[1.7] text-secondary-token sm:text-[16px]'>
        {body}
      </p>
    </div>
  );
}

function HomeHero() {
  return (
    <section
      className='relative overflow-hidden pb-12 pt-[5.75rem] md:pb-16 md:pt-[6.25rem] lg:pb-20'
      aria-labelledby='home-hero-heading'
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />
      <div className='hero-glow pointer-events-none absolute inset-x-0 top-0 h-[36rem]' />

      <Container size='homepage'>
        <div className='mx-auto max-w-[1120px]'>
          <div className='grid items-center gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-14'>
            <div className='max-w-[34rem]'>
              <p className='homepage-section-eyebrow'>
                The release system for independent artists
              </p>
              <h1
                id='home-hero-heading'
                className='marketing-h1-linear mt-5 max-w-[10ch] text-primary-token'
              >
                Drop more music. Crush every release.
              </h1>
              <p className='mt-5 max-w-[31rem] text-[17px] leading-[1.7] text-secondary-token sm:text-[18px]'>
                One system to make every release count, every time.
              </p>

              <div className='mt-8 flex flex-wrap items-center gap-3'>
                <Link
                  href={APP_ROUTES.SIGNUP}
                  className='btn-linear-signup focus-ring-themed inline-flex h-10 items-center px-4'
                >
                  Start Free
                </Link>
                <Link
                  href={APP_ROUTES.DEMO}
                  className='inline-flex h-10 items-center rounded-full border border-subtle px-4 text-sm font-medium text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token'
                >
                  See Demo
                </Link>
              </div>
            </div>

            <div className='lg:justify-self-center xl:justify-self-end'>
              <HomeHeroSurfaceCluster />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function HomeTrustBar() {
  return (
    <section className='border-y border-subtle bg-page/95'>
      <Container size='homepage'>
        <div className='mx-auto flex max-w-[1120px] flex-col gap-5 py-5 md:flex-row md:items-center md:justify-between'>
          <p className='text-[11px] text-tertiary-token'>
            Connected with leading label partners
          </p>

          <div className='flex flex-wrap items-center gap-x-6 gap-y-3 opacity-85 sm:gap-x-8'>
            {TRUST_LABELS.map(partner => (
              <HomepageLabelLogoMark
                key={partner}
                partner={partner}
                className='text-primary-token opacity-72'
              />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

function ArtistProfileSection() {
  return (
    <section className='border-b border-subtle bg-page py-20 sm:py-24 lg:py-28'>
      <Container size='homepage'>
        <div className='mx-auto grid max-w-[1120px] gap-12 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-center'>
          <div className='max-w-[34rem]'>
            <SectionHeader
              eyebrow='Artist Profiles'
              title='Profiles that convert.'
              body='One mobile profile can switch between growth, tickets, tips, and streams.'
            />
          </div>

          <div className='flex justify-center lg:justify-end'>
            <div className='w-full max-w-[36rem]'>
              <ArtistProfileModesShowcase />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function ReleaseDestinationsSection() {
  return (
    <section className='border-b border-subtle bg-page py-20 sm:py-24 lg:py-28'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[1120px]'>
          <div className='grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-end'>
            <SectionHeader
              eyebrow='Release Destinations'
              title='Every release gets a clean destination.'
              body='Presave before launch. Go live on the same surface when the record drops.'
            />

            <div className='border-t border-subtle pt-6'>
              <div className='flex flex-wrap items-center gap-x-6 gap-y-3 text-sm'>
                <span className='font-[560] text-primary-token'>
                  Presave first
                </span>
                <span className='text-tertiary-token'>
                  Countdown until launch.
                </span>
                <span
                  aria-hidden='true'
                  className='hidden h-1 w-1 rounded-full bg-white/18 sm:block'
                />
                <span className='font-[560] text-primary-token'>Go live</span>
                <span className='text-tertiary-token'>
                  Open the release fast.
                </span>
              </div>
            </div>
          </div>

          <div data-testid='homepage-release-destinations-surface'>
            <div className='mt-10 space-y-4 lg:hidden'>
              <ReleaseModeMockCard
                release={HOME_RELEASE_DESTINATION_PRESAVE_MOCK}
                variant='comparison'
                testId='homepage-release-destination-presave'
              />
              <div
                data-testid='homepage-release-destination-notification'
                className='rounded-[1.15rem] border border-white/10 bg-[linear-gradient(180deg,rgba(18,20,28,0.96),rgba(10,12,18,0.94))] px-4 py-3 shadow-[0_24px_70px_rgba(0,0,0,0.24)]'
              >
                <div className='flex items-center gap-3'>
                  <div className='flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]'>
                    <BellRing
                      className='h-4 w-4 text-white/62'
                      aria-hidden='true'
                    />
                  </div>
                  <div>
                    <p className='text-[10px] font-medium tracking-[0.02em] text-white/42'>
                      Release Notifications
                    </p>
                    <p className='mt-1 text-[13px] font-[560] text-white'>
                      Notify every fan. Every time. Automatically.
                    </p>
                  </div>
                </div>
              </div>
              <ReleaseModeMockCard
                release={HOME_RELEASE_DESTINATION_LIVE_MOCK}
                variant='comparison'
                testId='homepage-release-destination-live'
              />
            </div>

            <div className='relative mt-12 hidden min-h-[32rem] lg:block'>
              <div className='absolute left-0 top-0 z-20 w-[24rem] rotate-[-2deg]'>
                <ReleaseModeMockCard
                  release={HOME_RELEASE_DESTINATION_PRESAVE_MOCK}
                  variant='comparison'
                  testId='homepage-release-destination-presave'
                />
              </div>

              <div className='absolute right-0 top-10 z-10 w-[24rem] rotate-[1.5deg]'>
                <ReleaseModeMockCard
                  release={HOME_RELEASE_DESTINATION_LIVE_MOCK}
                  variant='comparison'
                  testId='homepage-release-destination-live'
                />
              </div>

              <div
                data-testid='homepage-release-destination-notification'
                className='absolute bottom-6 left-1/2 z-30 w-[30rem] -translate-x-1/2 rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(18,20,28,0.96),rgba(10,12,18,0.94))] px-5 py-3 shadow-[0_24px_70px_rgba(0,0,0,0.28)]'
              >
                <div className='flex items-center justify-center gap-3'>
                  <div className='flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]'>
                    <BellRing
                      className='h-4 w-4 text-white/62'
                      aria-hidden='true'
                    />
                  </div>
                  <p className='text-[13px] font-[560] tracking-[-0.01em] text-white'>
                    Notify every fan. Every time. Automatically.
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

function ReleaseOperatingSystemSection() {
  return (
    <section className='border-b border-subtle bg-page py-20 sm:py-24 lg:py-28'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[1120px]'>
          <div className='grid gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-end'>
            <SectionHeader
              eyebrow='Release Operating System'
              title='Context, monitoring, and tasks in one system.'
              body='Jovie knows the release, watches the rollout, and keeps the work attached to it.'
            />

            <div className='border-t border-subtle pt-6 text-sm'>
              <span className='font-[560] text-primary-token'>
                One working view
              </span>
              <span className='ml-3 text-tertiary-token'>
                Brief, coverage, and launch work stay together.
              </span>
            </div>
          </div>

          <div className='mt-10 lg:mt-12'>
            <ReleaseOperatingSystemShowcase />
          </div>
        </div>
      </Container>
    </section>
  );
}

function FinalCallToAction() {
  return (
    <section className='bg-page py-20 sm:py-24 lg:py-28'>
      <Container size='homepage'>
        <div className='mx-auto flex max-w-[1120px] flex-col gap-8 border-t border-subtle pt-12 sm:pt-14 lg:flex-row lg:items-end lg:justify-between'>
          <div className='max-w-[38rem]'>
            <p className='homepage-section-eyebrow'>Meet Jovie</p>
            <h2 className='marketing-h2-linear mt-4 text-primary-token'>
              Release day starts here.
            </h2>
            <p className='mt-4 max-w-[32rem] text-[15px] leading-[1.7] text-secondary-token sm:text-[16px]'>
              Profiles, smart links, context, monitoring, and tasks. All on
              Jovie.
            </p>
          </div>

          <div className='flex flex-wrap items-center gap-3 lg:justify-end'>
            <Link
              href={APP_ROUTES.SIGNUP}
              className='btn-linear-signup focus-ring-themed inline-flex h-10 items-center px-4'
            >
              Start Free
            </Link>
            <Link
              href={APP_ROUTES.SIGNIN}
              className='inline-flex h-10 items-center rounded-full border border-subtle px-4 text-sm font-medium text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token'
            >
              Log In
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}

export function HomePageNarrative() {
  return (
    <>
      <HomeHero />
      <HomeTrustBar />
      <ArtistProfileSection />
      <ReleaseDestinationsSection />
      <ReleaseOperatingSystemSection />
      <FinalCallToAction />
    </>
  );
}
