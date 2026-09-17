import {
  FaqSection,
  MarketingContainer,
  MarketingHero,
} from '@/components/marketing';
import { ABOUT_COPY, ABOUT_FAQ_ITEMS } from '@/data/aboutCopy';

export { ABOUT_FAQ_ITEMS };

export function AboutPageContent() {
  return (
    <>
      <MarketingHero variant='left'>
        <p className='text-sm font-medium text-tertiary-token'>
          {ABOUT_COPY.kicker}
        </p>
        <h1 className='mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-balance text-primary-token sm:text-5xl lg:text-6xl'>
          {ABOUT_COPY.headline}
        </h1>
        <p className='mt-6 max-w-2xl text-lg leading-relaxed text-secondary-token'>
          {ABOUT_COPY.support}
        </p>
      </MarketingHero>

      <MarketingContainer width='prose' className='pb-16'>
        <section>
          <h2 className='text-2xl font-semibold text-primary-token'>
            {ABOUT_COPY.origin.heading}
          </h2>
          <div className='mt-6 space-y-5 text-base leading-relaxed text-secondary-token'>
            {ABOUT_COPY.origin.paragraphs.map(paragraph => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <p className='text-primary-token'>{ABOUT_COPY.origin.signoff}</p>
          </div>
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
                  {feature.title}
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
    </>
  );
}
