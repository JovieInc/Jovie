import Image from 'next/image';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { APP_ROUTES } from '@/constants/routes';
import { ArtistProfileModesShowcase } from '@/features/home/ArtistProfileModesShowcase';
import { BentoFeatureGrid } from '@/features/home/BentoFeatureGrid';
import { EmailNotificationMockup } from '@/features/home/EmailNotificationMockup';
import { HomeHeroSurfaceCluster } from '@/features/home/HomeHeroSurfaceCluster';
import { HomepageLabelLogoMark } from '@/features/home/HomepageLabelLogoMark';
import { type HomepageLabelPartner } from '@/features/home/home-surface-seed';
import { SharedMarketingHero } from '@/features/landing/SharedMarketingHero';

const TRUST_LABELS: readonly HomepageLabelPartner[] = [
  'orchard',
  'awal',
  'umg',
  'armada',
] as const;

interface SectionHeaderProps {
  readonly title: string;
  readonly body: string;
}

function SectionHeader({ title, body }: Readonly<SectionHeaderProps>) {
  return (
    <div className='max-w-[42rem]'>
      <h2 className='marketing-h2-linear text-primary-token'>{title}</h2>
      <p className='mt-5 max-w-[32rem] text-[15px] leading-[1.75] text-secondary-token sm:text-[16px]'>
        {body}
      </p>
    </div>
  );
}

function HomeHero() {
  return (
    <SharedMarketingHero
      eyebrow=''
      headingId='home-hero-heading'
      sectionTestId='homepage-shell'
      primaryCtaLabel='Get Started'
      ctaEventName='landing_cta_get_started'
      primaryCtaTestId='homepage-primary-cta'
      title={
        <>
          <span className='block'>Drop more music.</span>
          <span className='block'>Crush every release.</span>
        </>
      }
      body='Your artist page, every release page, and the launch workflow behind them all run in one system.'
      media={<HomeHeroSurfaceCluster />}
      copyClassName='max-w-none'
      titleClassName='lg:!text-[48px] xl:!text-[52px]'
      gridClassName='lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8'
    />
  );
}

function HomeTrustBar() {
  return (
    <section className='bg-page py-8 sm:py-10'>
      <Container size='homepage'>
        <div className='mx-auto flex max-w-[1200px] items-center justify-center gap-x-8 sm:gap-x-10 lg:gap-x-14'>
          {TRUST_LABELS.map(partner => (
            <HomepageLabelLogoMark
              key={partner}
              partner={partner}
              className='text-primary-token opacity-[0.55]'
            />
          ))}
        </div>
      </Container>
    </section>
  );
}

function ArtistProfileSection() {
  return (
    <section className='border-b border-subtle bg-page py-16 sm:py-20 lg:py-24'>
      <Container size='homepage'>
        <div className='mx-auto grid max-w-[1200px] gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-center lg:gap-10'>
          <div>
            <SectionHeader
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

/** Animated flow arrow between release destination columns */
function FlowArrow() {
  return (
    <div
      className='hidden items-center justify-center lg:flex'
      aria-hidden='true'
    >
      <svg
        width='32'
        height='32'
        viewBox='0 0 32 32'
        fill='none'
        role='img'
        aria-label='Flow arrow'
        className='text-white/15'
      >
        <path
          d='M8 16h14m0 0l-5-5m5 5l-5 5'
          stroke='currentColor'
          strokeWidth='1.5'
          strokeLinecap='round'
          strokeLinejoin='round'
          className='animate-[flow-pulse_2.4s_ease-in-out_infinite]'
        />
      </svg>
    </div>
  );
}

function ReleaseDestinationsSection() {
  return (
    <section className='border-b border-subtle bg-page py-20 sm:py-24 lg:py-32'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px]'>
          <SectionHeader
            title='Share every release. Reach every fan. Automatically.'
            body='Presave before launch. Go live on the same surface when the record drops.'
          />

          {/* Flow grid: 3 panels with arrows between them */}
          <div
            data-testid='homepage-release-destinations-surface'
            className='mt-12 grid items-start gap-8 sm:grid-cols-2 sm:gap-6 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:gap-0'
          >
            {/* 1. Before Launch */}
            <div className='text-center'>
              <p className='mb-4 text-[13px] font-[560] text-secondary-token'>
                Before Launch
              </p>
              <div
                data-testid='homepage-release-destination-presave'
                className='mx-auto max-w-[18rem] overflow-hidden rounded-[1.35rem] border border-white/10 shadow-[0_24px_70px_rgba(0,0,0,0.24)]'
              >
                <Image
                  src='/product-screenshots/release-deep-end-phone.png'
                  alt='The Deep End by Cosmic Gate and Tim White — presave countdown'
                  width={390}
                  height={844}
                  sizes='(max-width: 288px) 100vw, 288px'
                  className='w-full'
                />
              </div>
            </div>

            <FlowArrow />

            {/* 2. After Launch */}
            <div className='text-center'>
              <p className='mb-4 text-[13px] font-[560] text-secondary-token'>
                After Launch
              </p>
              <div
                data-testid='homepage-release-destination-live'
                className='mx-auto max-w-[18rem] overflow-hidden rounded-[1.35rem] border border-white/10 shadow-[0_24px_70px_rgba(0,0,0,0.24)]'
              >
                <Image
                  src='/product-screenshots/release-take-me-over-phone.png'
                  alt='Take Me Over by Tim White feat. Erica Gibson — live smart link'
                  width={390}
                  height={844}
                  sizes='(max-width: 288px) 100vw, 288px'
                  className='w-full'
                />
              </div>
            </div>

            <FlowArrow />

            {/* 3. Fan Notification — release card + email, matched height */}
            <div className='text-center sm:col-span-2 lg:col-span-1'>
              <p className='mb-4 text-[13px] font-[560] text-secondary-token'>
                Fans get notified
              </p>
              <div
                data-testid='homepage-release-destination-email'
                className='mx-auto flex max-w-[18rem] flex-col gap-3'
              >
                {/* Release card — matches LatestReleaseCard style */}
                <div className='flex items-center gap-3 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(23,24,31,0.98),rgba(13,14,19,0.98))] p-3 shadow-[0_12px_32px_rgba(0,0,0,0.3)]'>
                  <div className='relative h-12 w-12 shrink-0 overflow-hidden rounded-lg'>
                    <Image
                      src='/img/releases/the-deep-end.jpg'
                      alt='The Deep End album art'
                      width={48}
                      height={48}
                      className='h-full w-full object-cover'
                    />
                  </div>
                  <div className='min-w-0 flex-1 text-left'>
                    <p className='truncate text-[12px] font-[560] text-white'>
                      The Deep End
                    </p>
                    <p className='truncate text-[10px] text-white/40'>
                      Cosmic Gate &amp; Tim White
                    </p>
                  </div>
                  <span className='shrink-0 rounded-full bg-white px-3 py-1 text-[10px] font-[560] text-black'>
                    Listen
                  </span>
                </div>

                {/* Email notification card */}
                <EmailNotificationMockup />
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function FinalCallToAction() {
  return (
    <section
      data-testid='final-cta-section'
      className='bg-page py-28 sm:py-36 lg:py-44'
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px] text-center'>
          <h2
            data-testid='final-cta-headline'
            className='marketing-h1-linear text-primary-token'
          >
            You made the song.
            <br />
            Now make it hit.
          </h2>
          <div className='mt-10'>
            <Link
              href={APP_ROUTES.SIGNUP}
              data-testid='final-cta-action'
              className='public-action-primary focus-ring-themed'
            >
              Get Started
            </Link>
            <p className='mt-3 text-[10px] text-tertiary-token'>
              No credit card required.
            </p>
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
      <BentoFeatureGrid />
      <FinalCallToAction />
    </>
  );
}
