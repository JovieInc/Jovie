import Image from 'next/image';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { APP_ROUTES } from '@/constants/routes';
import { ArtistProfileModesShowcase } from '@/features/home/ArtistProfileModesShowcase';
import { BentoFeatureGrid } from '@/features/home/BentoFeatureGrid';
import { HomeHeroSurfaceCluster } from '@/features/home/HomeHeroSurfaceCluster';
import { HomepageLabelLogoMark } from '@/features/home/HomepageLabelLogoMark';
import { type HomepageLabelPartner } from '@/features/home/home-surface-seed';

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
          <div className='grid items-center gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-8'>
            <div>
              <p className='homepage-section-eyebrow'>
                The release system for independent artists
              </p>
              <h1
                id='home-hero-heading'
                className='marketing-h1-linear mt-5 text-primary-token'
              >
                <span className='block'>Drop more music.</span>
                <span className='block'>Crush every release.</span>
              </h1>
              <p className='mt-5 max-w-[33rem] text-[17px] leading-[1.7] text-secondary-token sm:text-[18px]'>
                One system to make every release count, every time.
              </p>

              <div className='mt-8 flex flex-wrap items-center gap-3'>
                <Link
                  href={APP_ROUTES.SIGNUP}
                  className='btn-linear-signup focus-ring-themed inline-flex h-10 items-center px-4'
                >
                  Get Started
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
    <section className='bg-page py-8 sm:py-10'>
      <Container size='homepage'>
        <div className='mx-auto flex max-w-[1120px] items-center justify-center gap-x-8 sm:gap-x-10 lg:gap-x-14'>
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
        <div className='mx-auto grid max-w-[1120px] gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-center lg:gap-10'>
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
          <SectionHeader
            eyebrow='Release Destinations'
            title='Every release gets a clean destination.'
            body='Presave before launch. Go live on the same surface when the record drops.'
          />

          <div
            data-testid='homepage-release-destinations-surface'
            className='mt-12 grid gap-8 sm:grid-cols-2 sm:gap-6 lg:gap-10'
          >
            <div className='text-center'>
              <p className='mb-4 text-[13px] font-[560] text-secondary-token'>
                Before launch
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
                  className='w-full'
                />
              </div>
            </div>

            <div className='text-center'>
              <p className='mb-4 text-[13px] font-[560] text-secondary-token'>
                After launch
              </p>
              <div
                data-testid='homepage-release-destination-live'
                className='mx-auto max-w-[18rem] overflow-hidden rounded-[1.35rem] border border-white/10 shadow-[0_24px_70px_rgba(0,0,0,0.24)]'
              >
                <Image
                  src='/product-screenshots/release-take-me-over-phone.png'
                  alt='Take Me Over by Tim White — live smart link with streaming platforms'
                  width={390}
                  height={844}
                  className='w-full'
                />
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
    <section className='bg-page py-28 sm:py-36 lg:py-44'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[1120px] text-center'>
          <h2 className='marketing-h1-linear text-primary-token'>
            You made the song.
            <br />
            Now make it hit.
          </h2>
          <div className='mt-10'>
            <Link
              href={APP_ROUTES.SIGNUP}
              className='btn-linear-signup focus-ring-themed inline-flex h-12 items-center px-6 text-[15px]'
            >
              Get Started
            </Link>
            <p className='mt-3 text-[13px] text-tertiary-token'>
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
