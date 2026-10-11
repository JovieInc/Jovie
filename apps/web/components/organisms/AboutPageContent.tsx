import Image from 'next/image';
import Link from 'next/link';
import {
  FaqSection,
  MarketingContainer,
  MarketingHero,
  MarketingHeroPhoto,
} from '@/components/marketing';
import { AboutPageRefresh } from '@/components/organisms/AboutPageRefresh';
import { MarketingFooterCta } from '@/components/site/MarketingFooterCta';
import { ABOUT_COPY, ABOUT_FAQ_ITEMS } from '@/data/aboutCopy';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

export { ABOUT_FAQ_ITEMS };

const ABOUT_HERO_PHOTO = {
  src: '/images/marketing-hero/about.webp',
  width: 1600,
  height: 600,
} as const;

export function AboutPageContent() {
  if (FEATURE_FLAGS.SHOW_PUBLIC_ABOUT_FOOTER_REFRESH) {
    return <AboutPageRefresh />;
  }

  return (
    <>
      <div className='marketing-hero-dock marketing-hero-dock--inset relative overflow-hidden'>
        <MarketingHeroPhoto {...ABOUT_HERO_PHOTO} />
        <div
          aria-hidden='true'
          className='marketing-hero-backdrop pointer-events-none absolute inset-0'
        />
        <MarketingHero variant='left'>
          <p className='text-sm font-medium text-tertiary-token'>
            {ABOUT_COPY.kicker}
          </p>
          <h1 className='mt-6 max-w-2xl text-3xl font-semibold tracking-tight text-balance text-primary-token sm:text-5xl lg:text-6xl'>
            {ABOUT_COPY.headline}
          </h1>
          <p className='mt-6 max-w-2xl text-lg leading-relaxed text-secondary-token'>
            {ABOUT_COPY.support}
          </p>
        </MarketingHero>
      </div>

      <MarketingContainer width='page' className='pb-16'>
        <section className='flex flex-col items-start gap-10 lg:flex-row lg:gap-16'>
          <div className='min-w-0 max-w-prose flex-1'>
            <h2 className='text-2xl font-semibold text-primary-token'>
              {ABOUT_COPY.origin.heading}
            </h2>
            <div className='mt-6 space-y-5 text-base leading-relaxed text-secondary-token'>
              {ABOUT_COPY.origin.paragraphs.map(paragraph => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>
          <figure className='w-full overflow-hidden rounded-3xl border border-subtle bg-surface-1/20 lg:w-72 lg:shrink-0'>
            <Image
              alt='Tim White, founder of Jovie'
              className='aspect-square h-auto w-full object-cover'
              height={640}
              sizes='(min-width: 1024px) 18rem, 70vw'
              src='/images/avatars/tim-white.jpg'
              width={640}
            />
            <figcaption className='px-5 py-4 text-sm text-secondary-token'>
              <Link
                href={ABOUT_COPY.origin.href}
                prefetch={false}
                className='underline underline-offset-4'
              >
                {ABOUT_COPY.origin.signoff}
              </Link>
            </figcaption>
          </figure>
        </section>
      </MarketingContainer>

      <MarketingContainer width='prose' className='pb-16'>
        <section>
          <h2 className='text-2xl font-semibold text-primary-token'>
            {ABOUT_COPY.featuresHeading}
          </h2>
          <div className='mt-6 grid gap-8 sm:grid-cols-2'>
            {ABOUT_COPY.features.map(feature => (
              <div key={feature.title}>
                <h3 className='font-medium text-primary-token'>
                  <Link
                    href={feature.href}
                    prefetch={false}
                    className='underline underline-offset-4'
                  >
                    {feature.title}
                  </Link>
                </h3>
                <p className='mt-2 text-sm leading-relaxed text-secondary-token'>
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      </MarketingContainer>

      <FaqSection
        items={ABOUT_FAQ_ITEMS}
        headingClassName='text-2xl font-semibold tracking-tight text-primary-token'
      />

      <MarketingFooterCta
        title='Ready to build your Jovie profile?'
        ctaAnalyticsEvent='about_footer_cta_start'
        ctaAnalyticsSource='about_page_footer'
        prefetch={false}
      />
    </>
  );
}
