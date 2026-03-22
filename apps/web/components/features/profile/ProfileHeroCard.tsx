'use client';

import { CalendarDays } from 'lucide-react';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { ProfilePrimaryCTA } from '@/features/profile/ProfilePrimaryCTA';
import type { AvailableDSP } from '@/lib/dsp';
import type { Artist, LegacySocialLink } from '@/types/db';

type HeroRelease = {
  readonly title: string;
  readonly artworkUrl: string | null;
  readonly releaseDate: Date | string | null;
  readonly releaseType: string;
};

interface ProfileHeroCardProps {
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly mergedDSPs: AvailableDSP[];
  readonly latestRelease?: HeroRelease | null;
  readonly enableDynamicEngagement?: boolean;
  readonly subscribeTwoStep?: boolean;
  readonly autoOpenCapture?: boolean;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
});

function getHeroCopy(release: HeroRelease | null | undefined) {
  if (!release) {
    return {
      eyebrow: 'Stay in the loop',
      title: 'Never miss the next drop',
      description: 'Subscribe once and get the important stuff first.',
    };
  }

  if (!release.releaseDate) {
    return {
      eyebrow: 'Latest release',
      title: release.title,
      description: 'Listen now or subscribe for the next release.',
    };
  }

  const releaseDate = new Date(release.releaseDate);
  const now = new Date();
  const msUntilRelease = releaseDate.getTime() - now.getTime();
  const daysSinceRelease =
    (now.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24);

  if (msUntilRelease > 0) {
    return {
      eyebrow: `Coming ${dateFormatter.format(releaseDate)}`,
      title: release.title,
      description:
        'Hear it first with a release alert that lands before launch day.',
    };
  }

  if (daysSinceRelease <= 14) {
    return {
      eyebrow: 'Out now',
      title: release.title,
      description: 'Listen now and stay subscribed for what comes next.',
    };
  }

  return {
    eyebrow: 'Latest release',
    title: release.title,
    description: 'Catch up now and stay ready for the next release.',
  };
}

export function ProfileHeroCard({
  artist,
  socialLinks,
  mergedDSPs,
  latestRelease,
  enableDynamicEngagement = false,
  subscribeTwoStep = false,
  autoOpenCapture = false,
}: ProfileHeroCardProps) {
  const copy = getHeroCopy(latestRelease);

  return (
    <section className='px-3 py-3'>
      <div className='overflow-hidden rounded-3xl border border-subtle bg-surface-1 shadow-sm'>
        <div className='flex items-start gap-4 p-4'>
          <div className='relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-surface-2'>
            <ImageWithFallback
              src={latestRelease?.artworkUrl ?? artist.image_url}
              alt={
                latestRelease ? `${latestRelease.title} artwork` : artist.name
              }
              fill
              sizes='96px'
              className='object-cover'
              fallbackVariant={latestRelease ? 'release' : 'avatar'}
            />
          </div>

          <div className='min-w-0 flex-1'>
            <p className='text-xs font-semibold uppercase tracking-[0.14em] text-secondary-token'>
              {copy.eyebrow}
            </p>
            <h1 className='mt-2 text-base font-semibold text-primary-token'>
              {copy.title}
            </h1>
            <p className='mt-2 text-sm leading-6 text-secondary-token'>
              {copy.description}
            </p>
            {latestRelease?.releaseDate ? (
              <div className='mt-3 inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-xs text-secondary-token'>
                <CalendarDays className='h-3.5 w-3.5' aria-hidden='true' />
                <span>
                  {dateFormatter.format(new Date(latestRelease.releaseDate))}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className='border-t border-subtle/70 px-4 py-4'>
          <ProfilePrimaryCTA
            artist={artist}
            socialLinks={socialLinks}
            mergedDSPs={mergedDSPs}
            enableDynamicEngagement={enableDynamicEngagement}
            showCapture
            autoOpenCapture={autoOpenCapture}
            subscribeTwoStep={subscribeTwoStep}
          />
        </div>
      </div>
    </section>
  );
}
