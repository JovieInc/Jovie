import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Mark } from '@/lib/brand';
import type { ProfileAeoContent as ProfileAeoContentModel } from '@/lib/profile/aeo-content';

interface ProfileAeoContentProps {
  readonly content: ProfileAeoContentModel;
  readonly claimHref?: string;
}

export function ProfileAeoContent({
  content,
  claimHref,
}: ProfileAeoContentProps) {
  return (
    <section
      aria-labelledby='profile-aeo-heading'
      className='profile-aeo-content px-4 py-14 sm:px-6 lg:px-8 lg:py-20'
      data-testid='profile-aeo-content'
    >
      <div className='profile-aeo-content__inner mx-auto grid max-w-5xl gap-12 border-t pt-10 lg:gap-16 lg:pt-14'>
        <div className='space-y-4 lg:sticky lg:top-12 lg:self-start'>
          <h2
            id='profile-aeo-heading'
            className='profile-aeo-content__heading text-3xl font-semibold leading-tight tracking-tight text-balance'
          >
            About {content.artistName}
          </h2>
          <div className='profile-aeo-content__body space-y-4 text-mid leading-7 text-pretty'>
            {content.description.map(paragraph => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>

        <div className='space-y-5'>
          <h3 className='profile-aeo-content__subheading text-xl font-semibold leading-tight tracking-tight'>
            {content.artistName} FAQ
          </h3>
          <dl className='profile-aeo-content__faq-list divide-y border-y'>
            {content.faqs.map(item => (
              <div
                key={item.question}
                className='profile-aeo-content__faq-item grid gap-2 py-5 sm:gap-6'
              >
                <dt className='profile-aeo-content__term text-mid font-semibold leading-6 text-pretty'>
                  {item.question}
                </dt>
                <dd className='profile-aeo-content__answer text-sm leading-6 text-pretty'>
                  <span>{item.answer}</span>
                  <span aria-hidden='true'> </span>
                  <a
                    href={item.source.href}
                    className='profile-aeo-content__source inline-flex font-medium underline underline-offset-4 transition-colors duration-subtle'
                  >
                    Source: {item.source.label}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {claimHref ? (
          <aside
            aria-labelledby='profile-aeo-claim-heading'
            className='profile-aeo-claim-card relative overflow-hidden rounded-[2rem] border p-7 sm:p-10 lg:col-span-2 lg:p-12'
            data-testid='profile-aeo-claim-card'
          >
            <div className='relative grid items-end gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.6fr)] lg:gap-16'>
              <div className='max-w-2xl'>
                <div className='mb-10 flex items-center gap-3'>
                  <Mark
                    size={46}
                    className='profile-aeo-claim-card__mark shrink-0'
                  />
                  <p className='profile-aeo-claim-card__eyebrow text-xs font-semibold uppercase tracking-[0.16em]'>
                    Jovie artist profiles
                  </p>
                </div>
                {/* eslint-disable @jovie/canonical-ui-label-casing -- User-approved editorial sentence case. */}
                <h2
                  id='profile-aeo-claim-heading'
                  className='profile-aeo-claim-card__heading max-w-[14ch] text-4xl font-semibold leading-[0.98] tracking-[-0.045em] text-balance sm:text-5xl lg:text-6xl'
                >
                  Claim yours.
                </h2>
                {/* eslint-enable @jovie/canonical-ui-label-casing */}
              </div>

              <div className='flex flex-col items-start gap-6 lg:pb-1'>
                <p className='profile-aeo-claim-card__body max-w-md text-base leading-7 text-pretty'>
                  Music, shows, and fan updates. One place.
                </p>
                <Link
                  href={claimHref}
                  prefetch={false}
                  className='profile-aeo-claim-card__cta inline-flex min-h-12 items-center justify-center gap-3 rounded-full px-6 text-sm font-semibold transition-colors duration-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--profile-aeo-claim-ink) focus-visible:ring-offset-2'
                  aria-label={`Claim the ${content.artistName} profile and sign up for Jovie`}
                  data-testid='profile-aeo-claim-cta'
                >
                  Claim artist profile
                  <ArrowRight className='size-4' aria-hidden='true' />
                </Link>
                <p className='profile-aeo-claim-card__note text-xs font-medium'>
                  Free · Spotify verified
                </p>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
