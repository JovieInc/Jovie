import Image from 'next/image';
import {
  FaqSection,
  MarketingContainer,
  MarketingFeatureGrid,
  MarketingHero,
  MarketingHeroPhoto,
} from '@/components/marketing';
import { MarketingFooterCta } from '@/components/site/MarketingFooterCta';
import { ABOUT_FAQ_ITEMS } from '@/data/aboutCopy';
import {
  ABOUT_REFRESH_DIFFERENTIATORS,
  ABOUT_REFRESH_OPENER,
  ABOUT_REFRESH_TEAM,
} from '@/data/aboutFooterRefresh';

const ABOUT_HERO_PHOTO = {
  src: '/images/marketing-hero/about.webp',
  width: 1600,
  height: 600,
} as const;

const publishedTeam = ABOUT_REFRESH_TEAM.filter(
  member => member.name.length > 0 && member.bio.length > 0
);

export function AboutPageRefresh() {
  return (
    <div data-testid='about-page-refresh'>
      <div className='marketing-hero-dock marketing-hero-dock--inset relative overflow-hidden'>
        <MarketingHeroPhoto {...ABOUT_HERO_PHOTO} />
        <div
          aria-hidden='true'
          className='marketing-hero-backdrop pointer-events-none absolute inset-0'
        />
        <MarketingHero variant='left'>
          <p className='text-sm font-medium text-tertiary-token'>About</p>
          <h1 className='mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-balance text-primary-token sm:text-5xl lg:text-6xl'>
            {ABOUT_REFRESH_OPENER}
          </h1>
        </MarketingHero>
      </div>

      <MarketingContainer width='prose' className='pb-16'>
        <section aria-labelledby='about-differentiators-heading'>
          <h2
            id='about-differentiators-heading'
            className='text-2xl font-semibold text-primary-token'
          >
            Differentiators
          </h2>
          <MarketingFeatureGrid items={ABOUT_REFRESH_DIFFERENTIATORS} />
        </section>
      </MarketingContainer>

      <MarketingContainer width='page' className='pb-16'>
        <section aria-labelledby='about-team-heading'>
          <h2
            id='about-team-heading'
            className='text-2xl font-semibold text-primary-token'
          >
            Team
          </h2>
          {publishedTeam.length === 0 ? (
            <p className='mt-6 text-base leading-relaxed text-secondary-token'>
              TODO: Add team members from existing repo team records.
            </p>
          ) : (
            <ul className='mt-6 flex list-none flex-col gap-10 p-0'>
              {publishedTeam.map(member => (
                <li
                  key={member.name}
                  className='flex flex-col items-start gap-10 lg:flex-row lg:gap-16'
                >
                  <figure className='w-full overflow-hidden rounded-3xl border border-subtle bg-surface-1/20 lg:w-72 lg:shrink-0'>
                    <Image
                      alt={member.imageAlt}
                      className='aspect-square h-auto w-full object-cover'
                      height={640}
                      sizes='(min-width: 1024px) 18rem, 70vw'
                      src={member.imageSrc}
                      width={640}
                    />
                    <figcaption className='px-5 py-4 text-sm text-secondary-token'>
                      {member.signoff}
                    </figcaption>
                  </figure>
                  <p className='min-w-0 max-w-prose flex-1 text-base leading-relaxed text-secondary-token'>
                    {member.bio}
                  </p>
                </li>
              ))}
            </ul>
          )}
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
    </div>
  );
}
