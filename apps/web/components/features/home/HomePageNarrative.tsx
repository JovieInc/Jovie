import Image from 'next/image';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { APP_ROUTES } from '@/constants/routes';
import { PhoneFrame } from '@/features/home/PhoneFrame';
import { ProductScreenshot } from '@/features/home/ProductScreenshot';

const STACK_ROWS = [
  {
    manual: 'Build a new smart link every time',
    jovie: 'Generate the smart link automatically',
  },
  {
    manual: 'Update the profile by hand',
    jovie: 'Pull the release into the profile',
  },
  {
    manual: 'Run follow-up somewhere else',
    jovie: 'Keep the next move inside the release',
  },
  {
    manual: 'Guess what actually worked',
    jovie: 'See audience response in context',
  },
] as const;

function SectionIntro({
  label,
  title,
  body,
}: Readonly<{
  label: string;
  title: string;
  body?: string;
}>) {
  return (
    <div className='max-w-[30rem]'>
      <p className='homepage-kicker'>{label}</p>
      <h2 className='marketing-h2-linear mt-3 text-primary-token'>{title}</h2>
      {body ? (
        <p className='mt-3 max-w-[26rem] text-[15px] leading-[1.55] text-secondary-token sm:text-[16px]'>
          {body}
        </p>
      ) : null}
    </div>
  );
}

function HomeHero() {
  return (
    <section
      className='homepage-hero-shell relative overflow-hidden'
      aria-labelledby='home-hero-heading'
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />
      <div
        aria-hidden='true'
        className='hero-glow pointer-events-none absolute inset-0'
      />

      <Container size='homepage'>
        <div className='homepage-hero-grid mx-auto max-w-[1280px]'>
          <div className='homepage-hero-copy animate-homepage-rise'>
            <p className='homepage-kicker'>
              The Release Platform For Independent Artists
            </p>
            <h1
              id='home-hero-heading'
              className='marketing-h1-linear mt-4 max-w-[12ch] text-primary-token lg:max-w-none'
            >
              <span className='homepage-hero-line block'>Drop more music.</span>
              <span className='homepage-hero-line block'>
                Crush every release.
              </span>
            </h1>
            <p className='mt-4 max-w-[22rem] text-[16px] leading-[1.5] text-secondary-token sm:text-[17px]'>
              Links, routing, fan capture, and follow-up in one release system.
            </p>

            <div className='mt-7 flex flex-wrap items-center gap-3'>
              <Link
                href={APP_ROUTES.SIGNUP}
                className='btn-linear-signup focus-ring-themed inline-flex h-10 items-center px-4'
              >
                Start Free
              </Link>
              <Link
                href={APP_ROUTES.DEMO}
                className='homepage-secondary-cta focus-ring-themed inline-flex h-10 items-center rounded-full px-4 text-sm font-medium'
              >
                See Demo
              </Link>
            </div>
          </div>

          <div className='homepage-hero-visual animate-homepage-rise-delayed'>
            <ProductScreenshot
              src='/product-screenshots/releases-dashboard-sidebar.png'
              alt='Jovie dashboard showing the releases view with the release sidebar open'
              width={2880}
              height={1800}
              title='Jovie release command center'
              chrome='minimal'
              priority
              skipCheck
              testId='homepage-hero-screenshot'
              className='homepage-hero-screenshot rounded-[1.65rem]'
              imageClassName='homepage-hero-image'
            />
          </div>
        </div>
      </Container>
    </section>
  );
}

function ReleaseProofSection() {
  return (
    <section className='border-b border-subtle bg-page py-24 sm:py-28 lg:py-32'>
      <Container size='homepage'>
        <div className='homepage-proof-shell mx-auto max-w-[1240px]'>
          <div className='grid gap-8 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,0.28fr)] lg:items-end'>
            <SectionIntro
              label='Smart Links'
              title='One release. Twenty-seven destinations.'
              body='One link for every major DSP.'
            />

            <div className='homepage-proof-sidebar'>
              <div className='homepage-proof-stat'>
                <span className='homepage-proof-number'>27</span>
                <span className='homepage-proof-label'>
                  DSPs from one release
                </span>
              </div>
              <p className='homepage-proof-copy'>
                Spotify, Apple Music, YouTube, Amazon, Deezer, Tidal, and 21
                more.
              </p>
            </div>
          </div>

          <ProductScreenshot
            src='/product-screenshots/releases-dashboard-platforms-open.png'
            alt='Jovie releases dashboard showing the platform destinations open for a release'
            width={2880}
            height={1800}
            title='Release destinations'
            skipCheck
            testId='homepage-release-proof-screenshot'
            className='homepage-proof-shot'
            imageClassName='homepage-proof-image'
          />
        </div>
      </Container>
    </section>
  );
}

function WhyArtistsStopSection() {
  return (
    <section className='border-b border-subtle bg-page py-24 sm:py-28 lg:py-32'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[1240px]'>
          <SectionIntro
            label='Why Releases Stall'
            title='The stack kills momentum.'
            body='Manual tools restart the same work on every drop.'
          />

          <div className='homepage-stack-shell mt-8'>
            <div className='homepage-stack-topline'>
              <div>
                <p className='homepage-stack-title'>Manual stack</p>
                <span className='homepage-stack-meta'>Reset every release</span>
              </div>
              <div className='homepage-stack-topline-accent'>
                <p className='homepage-stack-title'>Jovie stack</p>
                <span className='homepage-stack-meta'>Built once, reused</span>
              </div>
            </div>

            <ol className='homepage-stack-rows'>
              {STACK_ROWS.map((row, index) => (
                <li key={row.manual} className='homepage-stack-row'>
                  <span className='homepage-stack-number'>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className='homepage-stack-cell homepage-stack-cell-manual'>
                    {row.manual}
                  </div>
                  <div className='homepage-stack-cell homepage-stack-cell-jovie'>
                    {row.jovie}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Container>
    </section>
  );
}

function SystemSection() {
  return (
    <section className='bg-page py-24 sm:py-28 lg:py-32'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[1240px] space-y-14 sm:space-y-16 lg:space-y-20'>
          <SectionIntro
            label='The System'
            title='Everything after the drop stays connected.'
            body='Profiles, response, and release context stay inside the same system.'
          />

          <article className='homepage-system-featured'>
            <div
              className='homepage-profile-spotlight'
              data-testid='homepage-system-profile-screenshot'
            >
              <div className='homepage-profile-device'>
                <PhoneFrame className='homepage-profile-phone'>
                  <Image
                    src='/product-screenshots/profile-phone.png'
                    alt='Mobile artist profile showing fan capture and release actions'
                    width={780}
                    height={1688}
                    className='h-full w-full object-cover object-top'
                    priority
                  />
                </PhoneFrame>
              </div>
            </div>

            <div className='homepage-feature-copy homepage-feature-copy-profile'>
              <div>
                <p className='homepage-kicker'>Artist Profiles</p>
                <h3 className='homepage-system-title'>
                  Profiles that convert.
                </h3>
              </div>
              <p className='homepage-system-body'>
                Turn the first click into a fan.
              </p>
            </div>
          </article>

          <div className='homepage-system-row'>
            <article className='homepage-system-card'>
              <ProductScreenshot
                src='/product-screenshots/audience-crm.png'
                alt='Jovie audience dashboard showing fan activity and release context'
                width={2880}
                height={1800}
                title='Audience visibility'
                skipCheck
                testId='homepage-system-audience-screenshot'
                className='homepage-wide-shot homepage-audience-shot'
                imageClassName='homepage-audience-image'
              />

              <div className='homepage-feature-copy'>
                <p className='homepage-kicker'>Audience Data</p>
                <h3 className='homepage-system-title'>
                  See who actually showed up.
                </h3>
                <p className='homepage-system-body'>
                  Every click stays tied to the release that earned it.
                </p>
              </div>
            </article>

            <article className='homepage-system-card'>
              <div className='lg:hidden'>
                <figure
                  aria-label='Jovie release sidebar showing the release playbook attached to a release'
                  data-testid='homepage-system-ai-screenshot-mobile'
                  className='homepage-planning-mobile-shell'
                >
                  <div
                    className='homepage-planning-mobile-bar'
                    aria-hidden='true'
                  >
                    <div className='homepage-planning-mobile-dots'>
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className='homepage-planning-mobile-title'>
                      Release playbook
                    </div>
                    <div className='homepage-planning-mobile-spacer' />
                  </div>
                  <div className='homepage-planning-mobile-media'>
                    <Image
                      src='/product-screenshots/release-sidebar-tasks.png'
                      alt='Jovie release sidebar showing the release playbook attached to a release'
                      width={776}
                      height={1690}
                      className='homepage-planning-mobile-image'
                    />
                  </div>
                </figure>
              </div>

              <div className='hidden lg:block'>
                <ProductScreenshot
                  src='/product-screenshots/releases-dashboard-tasks-open.png'
                  alt='Jovie releases dashboard showing the release playbook open in the sidebar'
                  width={2880}
                  height={1800}
                  title='Release playbook'
                  skipCheck
                  testId='homepage-system-ai-screenshot'
                  className='homepage-wide-shot homepage-planning-shot'
                  imageClassName='homepage-planning-image'
                />
              </div>

              <div className='homepage-feature-copy'>
                <p className='homepage-kicker'>Release Planning</p>
                <h3 className='homepage-system-title'>
                  Keep the playbook attached.
                </h3>
                <p className='homepage-system-body'>
                  Campaign moves stay tied to the release instead of floating
                  off into another tool.
                </p>
              </div>
            </article>
          </div>
        </div>
      </Container>
    </section>
  );
}

function FinalCallToAction() {
  return (
    <section className='bg-page pb-28 pt-14 sm:pb-32 sm:pt-16 lg:pb-40 lg:pt-20'>
      <Container size='homepage'>
        <div className='homepage-cta-shell mx-auto max-w-[1240px]'>
          <div className='max-w-[30rem]'>
            <h2 className='marketing-h2-linear text-primary-token'>
              Start the next release before this one cools off.
            </h2>
            <p className='mt-3 text-[15px] leading-[1.65] text-secondary-token sm:text-[16px]'>
              Connect Spotify. Run the stack once.
            </p>
          </div>

          <div className='homepage-cta-actions flex flex-wrap items-center gap-3'>
            <Link
              href={APP_ROUTES.SIGNUP}
              className='btn-linear-signup focus-ring-themed inline-flex h-10 items-center px-4'
            >
              Start Free
            </Link>
            <Link
              href={APP_ROUTES.ARTIST_PROFILES}
              className='homepage-secondary-cta focus-ring-themed inline-flex h-10 items-center rounded-full px-4 text-sm font-medium'
            >
              See Profiles
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
      <ReleaseProofSection />
      <WhyArtistsStopSection />
      <SystemSection />
      <FinalCallToAction />
    </>
  );
}
