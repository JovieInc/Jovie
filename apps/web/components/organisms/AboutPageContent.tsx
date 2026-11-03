import Link from 'next/link';
import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { MarketingFooterCta } from '@/components/site/MarketingFooterCta';
import { ABOUT_COPY, ABOUT_FAQ_ITEMS } from '@/data/aboutCopy';

export { ABOUT_FAQ_ITEMS };

const ROW_CLASS =
  'grid gap-4 border-t border-subtle py-16 md:grid-cols-12 md:gap-12';
const LABEL_CLASS = 'text-sm font-medium text-tertiary-token md:col-span-4';
const BODY_CLASS = 'max-w-prose md:col-span-8';

export function AboutPageContent() {
  return (
    <>
      <MarketingHero
        variant='left'
        testId='marketing-section-hero'
        sectionVariant='left-none'
        sectionOwner='apps/web/components/organisms/AboutPageContent.tsx'
      >
        <p className='text-sm font-medium text-tertiary-token'>
          {ABOUT_COPY.eyebrow}
        </p>
        <h1 className='mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-balance text-primary-token sm:text-5xl'>
          {ABOUT_COPY.headline}
        </h1>
      </MarketingHero>

      <MarketingContainer width='page' className='pb-24'>
        <section
          data-testid='marketing-section-content-prose'
          data-marketing-variant='article-body'
          data-marketing-owner='apps/web/components/organisms/AboutPageContent.tsx'
        >
          {ABOUT_COPY.sections.map(section => (
            <div key={section.id} className={ROW_CLASS}>
              <h2 className={LABEL_CLASS}>{section.label}</h2>
              <p
                className={`${BODY_CLASS} ${
                  section.id === 'what'
                    ? 'text-xl leading-relaxed text-primary-token'
                    : 'text-base leading-relaxed text-secondary-token'
                }`}
              >
                {section.text}
              </p>
            </div>
          ))}
          <div className={ROW_CLASS}>
            <h2 className={LABEL_CLASS}>{ABOUT_COPY.contact.label}</h2>
            <p
              className={`${BODY_CLASS} text-base leading-relaxed text-secondary-token`}
            >
              <a
                href={`mailto:${ABOUT_COPY.contact.email}`}
                className='text-primary-token underline underline-offset-4'
              >
                {ABOUT_COPY.contact.email}
              </a>
              <br />
              <Link
                href={ABOUT_COPY.contact.supportPath}
                prefetch={false}
                className='text-primary-token underline underline-offset-4'
              >
                {ABOUT_COPY.contact.supportLabel}
              </Link>
            </p>
          </div>
          <div className={ROW_CLASS}>
            <h2 className={LABEL_CLASS}>{ABOUT_COPY.related.label}</h2>
            <ul
              className={`${BODY_CLASS} flex flex-wrap gap-x-8 gap-y-2 text-base text-secondary-token`}
            >
              {ABOUT_COPY.related.links.map(link => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    prefetch={false}
                    className='text-primary-token underline underline-offset-4'
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section
          data-testid='marketing-section-faq'
          data-marketing-variant='objection-handler'
          data-marketing-owner='apps/web/components/organisms/AboutPageContent.tsx'
          className={ROW_CLASS}
        >
          <h2 className={LABEL_CLASS}>{ABOUT_COPY.questionsLabel}</h2>
          <dl className={`${BODY_CLASS} space-y-10`}>
            {ABOUT_FAQ_ITEMS.map(item => (
              <div key={item.question}>
                <dt className='text-base font-medium text-primary-token'>
                  {item.question}
                </dt>
                <dd className='mt-2 text-base leading-relaxed text-secondary-token'>
                  {item.answer}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </MarketingContainer>

      <MarketingFooterCta
        sectionVariant='final-single-claim'
        ctaAnalyticsEvent='about_footer_cta_start'
        ctaAnalyticsSource='about_page_footer'
        prefetch={false}
      />
    </>
  );
}
