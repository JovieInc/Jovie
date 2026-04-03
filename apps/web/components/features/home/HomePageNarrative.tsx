import {
  ArrowRight,
  BrainCircuit,
  Mail,
  Radar,
  Sparkles,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { DspLogo } from '@/components/atoms/DspLogo';
import { Container } from '@/components/site/Container';
import { APP_ROUTES } from '@/constants/routes';
import { LazyPhoneShowcase } from '@/features/home/LazyPhoneShowcase';
import { ProductScreenshot } from '@/features/home/ProductScreenshot';

const TRUST_PLATFORMS = [
  'spotify',
  'apple_music',
  'youtube_music',
  'amazon_music',
] as const;

const SMARTLINK_POINTS = [
  'Every release gets a destination, fast.',
  'Streaming buttons stay clean and ready to share.',
  'Fan emails can go out the second the release is live.',
] as const;

const AI_POINTS = [
  'Knows the release, not just the prompt.',
  'Writes from catalog, links, and profile context.',
  'Answers with the current state of the campaign.',
] as const;

const MONITORING_POINTS = [
  'Ingests catalog, release history, and profile presence.',
  'Shows what is missing across major DSPs.',
  'Keeps your release surface clean as the catalog grows.',
] as const;

const TASK_POINTS = [
  'Generates the release plan up front.',
  'Keeps briefs, notes, and handoff context in one place.',
  'Turns a launch into tracked work instead of loose docs.',
] as const;

interface ProfileMode {
  readonly id: 'profile' | 'tour' | 'tip' | 'listen';
  readonly headline: string;
  readonly description: string;
  readonly outcome: string;
}

const PROFILE_MODES: readonly ProfileMode[] = [
  {
    id: 'profile',
    headline: 'Keep the fan before they disappear.',
    description:
      'First-time visitors can subscribe fast. Returning fans see the next best action instead of a generic stack of links.',
    outcome: 'Grow',
  },
  {
    id: 'tour',
    headline: 'Show the closest show first.',
    description:
      'A fan in Los Angeles should not scroll through 30 cities. Jovie surfaces the nearest date and ticket button first.',
    outcome: 'Sell tickets',
  },
  {
    id: 'tip',
    headline: 'Turn in-person moments into revenue.',
    description:
      'When someone scans your QR code after a set, Jovie opens the fastest tip flow instead of another menu of links.',
    outcome: 'Earn tips',
  },
  {
    id: 'listen',
    headline: 'Open the right streaming app instantly.',
    description:
      'A new listener taps once. Jovie routes them to Spotify, Apple Music, or YouTube Music without the usual friction.',
    outcome: 'Boost streams',
  },
] as const;

const DEFERRED_SECTION_STYLE = {
  contentVisibility: 'auto',
  containIntrinsicSize: 'auto 1200px',
} as const;

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

function DetailList({ items }: Readonly<{ items: readonly string[] }>) {
  return (
    <div className='space-y-3 border-t border-subtle pt-6'>
      {items.map(item => (
        <div
          key={item}
          className='flex items-start gap-3 border-b border-subtle/80 pb-3 text-sm leading-6 text-secondary-token last:border-b-0 last:pb-0'
        >
          <span
            aria-hidden='true'
            className='mt-2 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]'
          />
          <span>{item}</span>
        </div>
      ))}
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
          <div className='grid items-end gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-14'>
            <div className='max-w-[34rem]'>
              <p className='homepage-section-eyebrow'>
                Built for independent artists
              </p>
              <h1
                id='home-hero-heading'
                className='marketing-h1-linear mt-5 max-w-[10ch] text-primary-token'
              >
                Drop More Music. Run Every Release.
              </h1>
              <p className='mt-5 max-w-[31rem] text-[17px] leading-[1.7] text-secondary-token sm:text-[18px]'>
                Profiles, smart links, release AI, monitoring, and tasks in one
                system.
              </p>

              <div className='mt-8 flex flex-wrap items-center gap-3'>
                <Link
                  href={APP_ROUTES.SIGNUP}
                  className='btn-linear-signup focus-ring-themed inline-flex h-10 items-center px-4'
                >
                  Get Started Free
                </Link>
                <span className='text-[12px] text-tertiary-token'>
                  Free forever. No credit card required.
                </span>
              </div>
            </div>

            <div>
              <ProductScreenshot
                src='/product-screenshots/releases-dashboard-full.png'
                alt='Jovie dashboard showing releases, smart links, artist data, and workflow'
                width={2880}
                height={1800}
                sizes='(max-width: 640px) calc(100vw - 42px), (max-width: 1023px) calc(100vw - 48px), (max-width: 1279px) 46vw, 560px'
                title='Jovie release command center'
                chrome='minimal'
                priority
                skipCheck
                quality={70}
                testId='homepage-hero-screenshot'
                className='rounded-[1.35rem]'
              />
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
          <p className='text-[11px] uppercase tracking-[0.08em] text-tertiary-token'>
            One system across the release stack
          </p>

          <div className='flex flex-wrap items-center gap-x-5 gap-y-3 opacity-85 sm:gap-x-7'>
            {TRUST_PLATFORMS.map(platform => (
              <DspLogo
                key={platform}
                provider={platform}
                height={18}
                className='text-primary-token'
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
    <section
      className='border-b border-subtle bg-page py-20 sm:py-24 lg:py-28'
      style={DEFERRED_SECTION_STYLE}
    >
      <Container size='homepage'>
        <div className='mx-auto grid max-w-[1120px] gap-12 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:items-center'>
          <div className='max-w-[34rem]'>
            <SectionHeader
              eyebrow='Artist Profiles'
              title='One profile. All the fan modes.'
              body='A fan can be here to listen, tip, buy tickets, or subscribe. Jovie changes the next step without turning your profile into clutter.'
            />

            <div className='mt-8 space-y-4'>
              {PROFILE_MODES.map(mode => (
                <div
                  key={mode.id}
                  className='border-b border-subtle pb-4 last:border-b-0 last:pb-0'
                >
                  <div className='flex items-center justify-between gap-4'>
                    <h3 className='text-[15px] font-[560] text-primary-token'>
                      {mode.outcome}
                    </h3>
                    <span className='text-[11px] uppercase tracking-[0.08em] text-tertiary-token'>
                      {mode.id}
                    </span>
                  </div>
                  <p className='mt-2 text-sm leading-6 text-secondary-token'>
                    {mode.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className='flex justify-center lg:justify-end'>
            <LazyPhoneShowcase modes={PROFILE_MODES} />
          </div>
        </div>
      </Container>
    </section>
  );
}

function SmartLinksSection() {
  return (
    <section
      className='border-b border-subtle bg-page py-20 sm:py-24 lg:py-28'
      style={DEFERRED_SECTION_STYLE}
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[1120px]'>
          <div className='grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] lg:items-end'>
            <SectionHeader
              eyebrow='Unlimited Smartlinks'
              title='Every release gets a clean destination.'
              body='Connect once. New release, new smart link, ready to ship. Then let Jovie nudge fans with the right email at the right time.'
            />

            <div className='space-y-6'>
              <DetailList items={SMARTLINK_POINTS} />

              <div className='rounded-[1.2rem] border border-subtle bg-surface-0/90 p-5'>
                <div className='flex items-center justify-between gap-4 border-b border-subtle pb-4'>
                  <div>
                    <p className='text-[11px] uppercase tracking-[0.08em] text-tertiary-token'>
                      Auto fan email
                    </p>
                    <h3 className='mt-1 text-[15px] font-[560] text-primary-token'>
                      New release is live
                    </h3>
                  </div>
                  <Mail
                    className='h-4 w-4 text-tertiary-token'
                    aria-hidden='true'
                  />
                </div>
                <div className='pt-4 text-sm leading-6 text-secondary-token'>
                  Your next release is out now. Tap once, pick your app, and go
                  listen.
                </div>
              </div>
            </div>
          </div>

          <div className='mt-10 lg:mt-12'>
            <ProductScreenshot
              src='/product-screenshots/release-sidebar-platforms.png'
              alt='Jovie release sidebar showing streaming platform smart links'
              width={2072}
              height={1608}
              title='Unlimited smart links'
              skipCheck
              testId='homepage-smartlinks-screenshot'
            />
          </div>
        </div>
      </Container>
    </section>
  );
}

function AiContextSection() {
  return (
    <section
      className='border-b border-subtle bg-page py-20 sm:py-24 lg:py-28'
      style={DEFERRED_SECTION_STYLE}
    >
      <Container size='homepage'>
        <div className='mx-auto grid max-w-[1120px] gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-start'>
          <div>
            <SectionHeader
              eyebrow='Release AI'
              title='AI that knows the context.'
              body='Jovie is not starting from zero every time. It sees the artist, the catalog, the release, and the work already in motion.'
            />

            <div className='mt-8 grid gap-4 sm:grid-cols-3'>
              <div>
                <BrainCircuit
                  className='h-4 w-4 text-tertiary-token'
                  aria-hidden='true'
                />
                <p className='mt-3 text-sm font-[560] text-primary-token'>
                  Catalog aware
                </p>
              </div>
              <div>
                <Workflow
                  className='h-4 w-4 text-tertiary-token'
                  aria-hidden='true'
                />
                <p className='mt-3 text-sm font-[560] text-primary-token'>
                  Release aware
                </p>
              </div>
              <div>
                <Sparkles
                  className='h-4 w-4 text-tertiary-token'
                  aria-hidden='true'
                />
                <p className='mt-3 text-sm font-[560] text-primary-token'>
                  Action aware
                </p>
              </div>
            </div>
          </div>

          <div className='overflow-hidden rounded-[1.2rem] border border-subtle bg-surface-0'>
            <div className='border-b border-subtle px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-tertiary-token'>
              Jovie AI
            </div>
            <div className='space-y-6 px-5 py-5'>
              <div>
                <p className='font-mono text-[12px] text-tertiary-token'>
                  {'> Draft release copy for my next single'}
                </p>
                <p className='mt-3 text-sm leading-6 text-secondary-token'>
                  Built from your current release, past catalog, artist profile,
                  and live smart link.
                </p>
              </div>

              <DetailList items={AI_POINTS} />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function MonitoringSection() {
  return (
    <section
      className='border-b border-subtle bg-page py-20 sm:py-24 lg:py-28'
      style={DEFERRED_SECTION_STYLE}
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[1120px]'>
          <div className='grid gap-10 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:items-end'>
            <SectionHeader
              eyebrow='Catalog Monitoring'
              title='Your catalog and profile presence, in one view.'
              body='Jovie ingests the catalog, the profiles, and the release surface across major DSPs so you can spot gaps and keep everything current.'
            />

            <div className='space-y-6'>
              <div className='grid gap-5 sm:grid-cols-2'>
                <div>
                  <Radar
                    className='h-4 w-4 text-tertiary-token'
                    aria-hidden='true'
                  />
                  <p className='mt-3 text-sm font-[560] text-primary-token'>
                    Presence checks
                  </p>
                </div>
                <div>
                  <ArrowRight
                    className='h-4 w-4 text-tertiary-token'
                    aria-hidden='true'
                  />
                  <p className='mt-3 text-sm font-[560] text-primary-token'>
                    Clear next action
                  </p>
                </div>
              </div>

              <DetailList items={MONITORING_POINTS} />
            </div>
          </div>

          <div className='mt-10 lg:mt-12'>
            <ProductScreenshot
              src='/product-screenshots/audience-crm.png'
              alt='Jovie audience and catalog dashboard'
              width={2880}
              height={1800}
              title='Catalog and audience visibility'
              skipCheck
              testId='homepage-monitoring-screenshot'
            />
          </div>
        </div>
      </Container>
    </section>
  );
}

function TasksSection() {
  return (
    <section
      className='border-b border-subtle bg-page py-20 sm:py-24 lg:py-28'
      style={DEFERRED_SECTION_STYLE}
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[1120px]'>
          <div className='grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start'>
            <SectionHeader
              eyebrow='Release Tasks'
              title='A promotion plan, generated for every release.'
              body='Jovie turns a release into a real operating plan. Tasks appear automatically, stay attached to the release, and keep the brief close to the work.'
            />

            <div className='space-y-6'>
              <DetailList items={TASK_POINTS} />
            </div>
          </div>

          <div className='mt-10 lg:mt-12'>
            <ProductScreenshot
              src='/product-screenshots/release-sidebar-tasks.png'
              alt='Jovie task manager showing a release promotion checklist'
              width={2072}
              height={1608}
              title='Release task manager'
              skipCheck
              testId='homepage-tasks-screenshot'
            />
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
          <div className='max-w-[34rem]'>
            <p className='homepage-section-eyebrow'>Set up once</p>
            <h2 className='marketing-h2-linear mt-4 text-primary-token'>
              Own the release stack.
            </h2>
            <p className='mt-4 max-w-[30rem] text-[15px] leading-[1.7] text-secondary-token sm:text-[16px]'>
              Profiles, smart links, context, monitoring, and tasks. One place.
            </p>
          </div>

          <div className='flex flex-wrap items-center gap-3'>
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
      <SmartLinksSection />
      <AiContextSection />
      <MonitoringSection />
      <TasksSection />
      <FinalCallToAction />
    </>
  );
}
