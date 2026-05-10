'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useRef } from 'react';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { HomepageTrackedLink } from './HomepageTrackedLink';

type HomepageMarketingImage = {
  readonly publicUrl: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
};

export type HomepageArtistProfileCard = {
  readonly id: string;
  readonly title: string;
  readonly image: HomepageMarketingImage;
  readonly glow: 'cyan' | 'blue' | 'violet' | 'magenta' | 'aurora';
};

export function HomepageArtistProfilesCarousel({
  cards,
}: Readonly<{ cards: readonly HomepageArtistProfileCard[] }>) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const copy = HOMEPAGE_LAUNCH_COPY.artistProfiles;

  const scrollRail = (direction: 'previous' | 'next') => {
    const rail = railRef.current;
    if (!rail) return;

    const distance = rail.clientWidth * 0.78;
    rail.scrollBy({
      left: direction === 'next' ? distance : -distance,
      behavior: 'smooth',
    });
  };

  return (
    <section
      id='artist-profiles'
      className='homepage-artist-profiles-section'
      aria-labelledby='homepage-artist-profiles-heading'
      data-testid='homepage-artist-profiles-section'
    >
      <div className='homepage-artist-profiles-section__inner'>
        <div className='homepage-artist-profiles-section__header'>
          <div>
            <h2 id='homepage-artist-profiles-heading'>
              <span>{copy.headline}</span>
              <span>{copy.headlineAccent}</span>
            </h2>
          </div>
          <div className='homepage-artist-profiles-section__meta'>
            <span>{copy.subhead}</span>
            <div className='homepage-artist-profiles-section__actions'>
              <HomepageTrackedLink
                href={copy.primaryCta.href}
                className='homepage-artist-profiles-section__primary focus-ring-themed'
                eventName='homepage_profile_cta_clicked'
                eventProperties={{ cta: 'claim_profile' }}
              >
                {copy.primaryCta.label}
              </HomepageTrackedLink>
              <HomepageTrackedLink
                href={copy.secondaryCta.href}
                className='homepage-artist-profiles-section__secondary focus-ring-themed'
                eventName='homepage_profile_cta_clicked'
                eventProperties={{ cta: 'view_example' }}
              >
                {copy.secondaryCta.label}
              </HomepageTrackedLink>
            </div>
          </div>
        </div>

        <div className='homepage-artist-profiles-carousel'>
          <div className='homepage-artist-profiles-carousel__controls'>
            <button
              type='button'
              aria-label='Previous artist profile preview'
              onClick={() => scrollRail('previous')}
            >
              <ChevronLeft aria-hidden='true' size={18} strokeWidth={1.9} />
            </button>
            <button
              type='button'
              aria-label='Next artist profile preview'
              onClick={() => scrollRail('next')}
            >
              <ChevronRight aria-hidden='true' size={18} strokeWidth={1.9} />
            </button>
          </div>

          <div
            ref={railRef}
            className='homepage-artist-profiles-carousel__rail'
          >
            <div className='homepage-artist-profiles-carousel__keyboard-controls'>
              <button
                type='button'
                aria-label='Scroll artist profile previews left'
                onClick={() => scrollRail('previous')}
              >
                <ChevronLeft aria-hidden='true' size={16} strokeWidth={1.9} />
              </button>
              <button
                type='button'
                aria-label='Scroll artist profile previews right'
                onClick={() => scrollRail('next')}
              >
                <ChevronRight aria-hidden='true' size={16} strokeWidth={1.9} />
              </button>
            </div>
            <ol
              className='homepage-artist-profiles-carousel__list'
              aria-label='Artist profile outcomes'
            >
              {cards.map(card => (
                <li
                  className={`homepage-artist-profile-card homepage-artist-profile-card--${card.glow}`}
                  key={card.id}
                >
                  <HomepageTrackedLink
                    href={copy.secondaryCta.href}
                    className='homepage-artist-profile-card__link'
                    eventName='homepage_profile_preview_clicked'
                    eventProperties={{ card: card.id }}
                  >
                    <h3>{card.title}</h3>
                    <div className='homepage-artist-profile-card__phone'>
                      <div className='homepage-artist-profile-card__screen'>
                        <Image
                          src={card.image.publicUrl}
                          alt={card.image.alt}
                          width={card.image.width}
                          height={card.image.height}
                          loading='lazy'
                          sizes='(min-width: 1280px) 224px, (min-width: 768px) 21vw, 66vw'
                          unoptimized
                        />
                      </div>
                    </div>
                  </HomepageTrackedLink>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
