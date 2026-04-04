import { BellRing, CheckCircle2, Circle } from 'lucide-react';
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
    <div className='max-w-[36rem]'>
      <p className='homepage-section-eyebrow'>{eyebrow}</p>
      <h2 className='marketing-h2-linear mt-4 text-primary-token'>{title}</h2>
      <p className='mt-5 max-w-[32rem] text-[15px] leading-[1.75] text-secondary-token sm:text-[16px]'>
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
          <div className='grid items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
            <div>
              <p className='homepage-section-eyebrow'>
                The release system for independent artists
              </p>
              <h1
                id='home-hero-heading'
                className='marketing-h1-linear mt-5 text-primary-token'
              >
                Drop more music.
                <br className='hidden xl:inline' /> Crush every release.
              </h1>
              <p className='mt-5 max-w-[33rem] text-[17px] leading-[1.7] text-secondary-token sm:text-[18px]'>
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
            Trusted by artists on
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
    <section className='border-b border-subtle bg-page py-20 sm:py-24 lg:py-32'>
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
    <section className='border-b border-subtle bg-page py-20 sm:py-24 lg:py-32'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[1120px]'>
          <div className='grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-end'>
            <SectionHeader
              eyebrow='Release Destinations'
              title='Every release gets a clean destination.'
              body='Presave before launch. Go live on the same surface when the record drops.'
            />

            <div className='border-t border-subtle pt-7'>
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

            <div className='relative mt-14 hidden min-h-[36rem] lg:block'>
              <div className='absolute left-0 top-0 z-20 w-[22rem] rotate-[-2deg]'>
                <ReleaseModeMockCard
                  release={HOME_RELEASE_DESTINATION_PRESAVE_MOCK}
                  variant='comparison'
                  testId='homepage-release-destination-presave'
                />
              </div>

              <div className='absolute right-0 top-8 z-10 w-[22rem] rotate-[1.5deg]'>
                <ReleaseModeMockCard
                  release={HOME_RELEASE_DESTINATION_LIVE_MOCK}
                  variant='comparison'
                  testId='homepage-release-destination-live'
                />
              </div>

              <div
                data-testid='homepage-release-destination-notification'
                className='absolute bottom-5 left-1/2 z-30 w-[28rem] -translate-x-1/2 rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(18,20,28,0.96),rgba(10,12,18,0.94))] px-5 py-3 shadow-[0_24px_70px_rgba(0,0,0,0.28)]'
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
    <section className='border-b border-subtle bg-page py-20 sm:py-24 lg:py-32'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[1120px]'>
          <div className='grid gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-end'>
            <SectionHeader
              eyebrow='Release Operating System'
              title='Your release operating system.'
              body='Jovie knows the release, watches the rollout, and keeps the work attached to it.'
            />

            <div className='border-t border-subtle pt-7 text-sm'>
              <span className='font-[560] text-primary-token'>
                One working view
              </span>
              <span className='ml-3 text-tertiary-token'>
                Brief, coverage, and launch work stay together.
              </span>
            </div>
          </div>

          <div className='mt-12 lg:mt-14'>
            <ReleaseOperatingSystemShowcase />
          </div>
        </div>
      </Container>
    </section>
  );
}

function AutomatedMomentumSection() {
  return (
    <section className='border-b border-subtle bg-page py-20 sm:py-24 lg:py-32'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[1120px]'>
          <div className='grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center'>
            <div className='space-y-3'>
              <div className='rounded-2xl bg-white/[0.04] px-5 py-4'>
                <div className='flex items-center gap-3'>
                  <span className='h-2 w-2 rounded-full bg-violet-400' />
                  <p className='text-[14px] font-[530] text-white'>
                    &ldquo;The Sound&rdquo; drops in 48 hours
                  </p>
                </div>
                <p className='mt-1 pl-5 text-[12px] text-white/40'>
                  1,247 fans notified automatically
                </p>
              </div>

              <div className='rounded-2xl bg-white/[0.04] px-5 py-4'>
                <div className='flex items-center gap-3'>
                  <span className='h-2 w-2 rounded-full bg-emerald-400' />
                  <p className='text-[14px] font-[530] text-white'>
                    Now streaming everywhere
                  </p>
                </div>
                <p className='mt-1 pl-5 text-[12px] text-white/40'>
                  Smart link live. Fans redirected by timezone.
                </p>
              </div>
            </div>

            <div>
              <p className='homepage-section-eyebrow'>Automated</p>
              <h2 className='marketing-h2-linear mt-4 text-primary-token'>
                Fans know before you do.
              </h2>
              <p className='mt-4 max-w-[28rem] text-[15px] leading-[1.7] text-secondary-token'>
                Presave fans get notified the second it drops. In their
                timezone.
              </p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function CommandCenterSection() {
  return (
    <section className='border-b border-subtle bg-page py-20 sm:py-24 lg:py-32'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[1120px]'>
          <div className='grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start'>
            <div>
              <p className='homepage-section-eyebrow'>Task & Playbook</p>
              <h2 className='marketing-h2-linear mt-4 text-primary-token'>
                Command center for your career.
              </h2>
              <p className='mt-5 max-w-[28rem] text-[15px] leading-[1.7] text-secondary-token'>
                Jovie generates a release playbook from your brief. Tasks track
                themselves.
              </p>

              <div className='mt-8 flex items-center gap-4'>
                {TRUST_LABELS.map(partner => (
                  <HomepageLabelLogoMark
                    key={partner}
                    partner={partner}
                    className='text-white/30'
                  />
                ))}
              </div>
            </div>

            <div className='rounded-2xl bg-white/[0.04] p-5'>
              <div className='flex items-center justify-between pb-4'>
                <p className='text-[11px] font-medium text-white/40'>
                  Release playbook
                </p>
                <p className='text-[11px] text-white/25'>3 of 4 done</p>
              </div>

              <div className='space-y-0'>
                {[
                  {
                    title: 'Metadata verified',
                    detail: 'ISRC and UPC synced',
                    done: true,
                  },
                  {
                    title: 'Upload Canvas to Spotify',
                    detail: 'Started today',
                    done: true,
                  },
                  {
                    title: 'Pitch to editorial playlists',
                    detail: 'Due in 3 days',
                    done: true,
                  },
                  {
                    title: 'Schedule launch day posts',
                    detail: 'Queued',
                    done: false,
                  },
                ].map(item => (
                  <div
                    key={item.title}
                    className='flex items-center justify-between border-t border-white/6 py-3'
                  >
                    <div className='flex items-center gap-3'>
                      {item.done ? (
                        <CheckCircle2 className='h-3.5 w-3.5 text-emerald-400/70' />
                      ) : (
                        <Circle className='h-3.5 w-3.5 text-white/20' />
                      )}
                      <span
                        className={`text-[13px] ${item.done ? 'text-white/40 line-through' : 'text-white/80'}`}
                      >
                        {item.title}
                      </span>
                    </div>
                    <span className='text-[11px] text-white/25'>
                      {item.detail}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function WorkflowSection() {
  return (
    <section className='border-b border-subtle bg-page py-20 sm:py-24 lg:py-32'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[1120px]'>
          <SectionHeader
            eyebrow='Full Release Lifecycle'
            title='Momentum starts with a system.'
            body='Before, during, and after the drop. One system covers the whole arc.'
          />

          <div className='mt-12 flex flex-col gap-0 sm:flex-row sm:items-stretch'>
            {[
              {
                phase: 'Before',
                line: 'Pitch, metadata, assets.',
              },
              {
                phase: 'Launch',
                line: 'Links live, fans notified, streams tracked.',
              },
              {
                phase: 'After',
                line: 'Playlist tracking, follow-ups, momentum.',
              },
            ].map((step, i) => (
              <div
                key={step.phase}
                className={`flex-1 border-t border-white/8 py-6 sm:border-l sm:border-t-0 sm:pl-6 ${i === 0 ? 'sm:border-l-0 sm:pl-0' : ''}`}
              >
                <p className='text-[11px] font-medium text-white/40'>
                  {step.phase}
                </p>
                <p className='mt-2 text-[13px] leading-relaxed text-white/60'>
                  {step.line}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

function FinalCallToAction() {
  return (
    <section className='bg-page py-28 sm:py-36 lg:py-44'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[1120px] text-center'>
          <h2 className='marketing-h1-linear text-primary-token'>
            You made the song.
            <br />
            Now make it hit.
          </h2>
          <p className='mx-auto mt-6 max-w-[28rem] text-[17px] leading-[1.7] text-secondary-token sm:text-[18px]'>
            No credit card required.
          </p>

          <div className='mt-10'>
            <Link
              href={APP_ROUTES.SIGNUP}
              className='btn-linear-signup focus-ring-themed inline-flex h-12 items-center px-6 text-[15px]'
            >
              Start Free
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
      <AutomatedMomentumSection />
      <ReleaseOperatingSystemSection />
      <CommandCenterSection />
      <WorkflowSection />
      <FinalCallToAction />
    </>
  );
}
