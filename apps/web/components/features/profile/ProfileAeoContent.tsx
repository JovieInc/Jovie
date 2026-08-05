import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/atoms/Badge';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { ProfileAboutShare } from '@/features/profile/ProfileAboutShare';
import { normalizePlatformKey } from '@/lib/dsp-registry';
import type { ProfileAeoContent as ProfileAeoContentModel } from '@/lib/profile/aeo-content';
import { publicLinkAriaLabel } from '@/lib/utils/public-url';
import { EntityMentionText } from './EntityMentionText';

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
      className='profile-aeo-content px-4 py-10 sm:px-6 lg:px-8 lg:py-14'
      data-testid='profile-aeo-content'
    >
      <div className='profile-aeo-content__inner mx-auto grid max-w-5xl gap-8 border-t pt-8 lg:gap-11 lg:pt-10'>
        <div className='space-y-5 lg:sticky lg:top-12 lg:self-start'>
          <div className='flex items-start justify-between gap-4'>
            <h2
              id='profile-aeo-heading'
              className='profile-aeo-content__heading text-3xl font-semibold leading-tight tracking-tight text-balance'
            >
              About {content.artistName}
            </h2>
            <ProfileAboutShare
              url={content.profileUrl}
              artistName={content.artistName}
            />
          </div>

          {content.facts.length > 0 ? (
            <dl
              className='profile-aeo-content__facts grid grid-cols-2 gap-2 border-y py-4 sm:grid-cols-3 sm:gap-3 lg:grid-cols-2'
              data-testid='profile-about-facts'
            >
              {content.facts.map(fact => (
                <div key={fact.label} className='min-w-0 space-y-1.5'>
                  <dt className='profile-aeo-content__fact-label text-xs font-medium'>
                    {fact.label}
                  </dt>
                  <dd className='min-w-0'>
                    <Badge
                      variant='outline'
                      size='md'
                      className='profile-aeo-content__fact-value w-full max-w-full justify-start border-(--profile-aeo-border) bg-transparent sm:w-auto'
                    >
                      <span className='min-w-0 truncate' title={fact.value}>
                        {fact.value}
                      </span>
                    </Badge>
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {content.listenLinks.length > 0 ? (
            <div className='space-y-2' data-testid='profile-about-listen'>
              <h3 className='profile-aeo-content__link-label text-xs font-medium'>
                Listen
              </h3>
              <ul className='flex flex-wrap items-center gap-x-5 gap-y-2'>
                {content.listenLinks.map(link => (
                  <li key={link.id}>
                    <a
                      href={link.url}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='profile-aeo-content__link inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--profile-aeo-text) focus-visible:ring-offset-2 focus-visible:ring-offset-(--system-b-cinematic-black)'
                    >
                      <SocialIcon
                        platform={
                          normalizePlatformKey(link.platform) === 'netease'
                            ? 'neteasemusic'
                            : link.platform
                        }
                        className='h-5 w-5'
                      />
                      <span className='sr-only'>
                        Listen to {content.artistName} on {link.label} (opens in
                        a new tab)
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {content.followLinks.length > 0 ? (
            <div className='space-y-2' data-testid='profile-about-follow'>
              <h3 className='profile-aeo-content__link-label text-xs font-medium'>
                Follow
              </h3>
              <ul className='flex flex-wrap items-center gap-1'>
                {content.followLinks.map(link => (
                  <li key={link.id}>
                    <a
                      href={link.url}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='profile-aeo-content__link inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--profile-aeo-text)'
                      aria-label={publicLinkAriaLabel(
                        content.artistName,
                        link.platform,
                        link.label
                      )}
                    >
                      <SocialIcon
                        platform={link.platform}
                        className='h-5 w-5'
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className='profile-aeo-content__body space-y-3 text-mid leading-7 text-pretty'>
            {content.descriptionSegments.map((segments, index) => (
              <p key={content.description[index] ?? index}>
                <EntityMentionText segments={segments} />
              </p>
            ))}
          </div>
        </div>

        <div className='space-y-4'>
          <h3 className='profile-aeo-content__subheading text-xl font-semibold leading-tight tracking-tight'>
            {content.artistName} FAQ
          </h3>
          <dl className='profile-aeo-content__faq-list divide-y border-y'>
            {content.faqs.map(item => (
              <div
                key={item.question}
                className='profile-aeo-content__faq-item grid gap-2 py-4 sm:gap-5'
              >
                <dt className='profile-aeo-content__term text-mid font-semibold leading-6 text-pretty'>
                  {item.question}
                </dt>
                <dd className='profile-aeo-content__answer text-sm leading-6 text-pretty'>
                  <span>{item.answer}</span>
                  <span aria-hidden='true'> </span>
                  <a
                    href={item.source.href}
                    className='profile-aeo-content__source -my-2.5 inline-flex min-h-11 items-center py-2.5 font-medium underline underline-offset-4 transition-colors duration-subtle'
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
            className='profile-aeo-claim-card relative overflow-hidden rounded-3xl border p-6 sm:p-8 lg:col-span-2 lg:p-9'
            data-testid='profile-aeo-claim-card'
          >
            <div className='relative flex flex-col gap-8 sm:gap-10'>
              {/* eslint-disable @jovie/canonical-ui-label-casing -- Canonical URLs are lowercase. */}
              <h2
                id='profile-aeo-claim-heading'
                className='profile-aeo-claim-card__heading font-display font-semibold'
                aria-label='jov.ie/you'
              >
                <span className='profile-aeo-claim-card__domain'>jov.ie/</span>
                <span>you</span>
              </h2>
              {/* eslint-enable @jovie/canonical-ui-label-casing */}

              <div className='flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between'>
                <p className='profile-aeo-claim-card__note text-xs font-medium'>
                  Free · Claim with Spotify
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
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
