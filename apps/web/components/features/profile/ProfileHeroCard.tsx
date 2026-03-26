'use client';

import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { VerifiedBadge } from '@/components/atoms/VerifiedBadge';
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

  const hasRelease = !!latestRelease;

  return (
    <section className='flex flex-col items-center px-4 py-6 text-center sm:py-8'>
      <div className='relative'>
        <div
          className={`relative h-40 w-40 shrink-0 overflow-hidden bg-surface-2 shadow-sm sm:h-48 sm:w-48 ${
            hasRelease ? 'rounded-2xl' : 'rounded-full'
          }`}
        >
          <ImageWithFallback
            src={latestRelease?.artworkUrl ?? artist.image_url}
            alt={latestRelease ? `${latestRelease.title} artwork` : artist.name}
            fill
            sizes='(min-width: 640px) 192px, 160px'
            className='object-cover'
            fallbackVariant={hasRelease ? 'release' : 'avatar'}
          />
        </div>
        {artist.is_verified && (
          <span className='absolute -bottom-0.5 -right-0.5'>
            <VerifiedBadge size='lg' />
          </span>
        )}
      </div>

      <div className='mt-4 max-w-sm space-y-1.5'>
        <p className='text-xs font-semibold uppercase tracking-[0.14em] text-secondary-token'>
          {copy.eyebrow}
        </p>
        <h1 className='text-lg font-semibold text-primary-token'>
          {copy.title}
        </h1>
        <p className='text-sm leading-6 text-secondary-token'>
          {copy.description}
        </p>
      </div>

      <div className='mt-5 w-full max-w-xs'>
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
    </section>
  );
}
