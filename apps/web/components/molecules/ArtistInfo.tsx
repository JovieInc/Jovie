import Link from 'next/link';
import { ArtistName } from '@/components/atoms/ArtistName';
import { Avatar } from '@/components/molecules/Avatar';
import { DEFAULT_PROFILE_TAGLINE } from '@/constants/app';
import { Artist } from '@/types/db';

interface ArtistInfoProps {
  readonly artist: Artist;
  readonly subtitle?: string;
  readonly avatarSize?: 'sm' | 'md' | 'lg' | 'xl';
  readonly nameSize?: 'sm' | 'md' | 'lg' | 'xl';
  readonly className?: string;
  /** Whether avatar should link to profile root (useful on deep link routes) */
  readonly linkToProfile?: boolean;
}

export function ArtistInfo({
  artist,
  subtitle,
  avatarSize = 'xl',
  nameSize = 'lg',
  className = '',
  linkToProfile = true,
}: ArtistInfoProps) {
  const resolvedSubtitle =
    subtitle ?? artist.tagline ?? DEFAULT_PROFILE_TAGLINE;
  const subtitleClassName =
    resolvedSubtitle === DEFAULT_PROFILE_TAGLINE
      ? 'text-[11px] sm:text-xs font-normal tracking-[0.2em] uppercase leading-none text-tertiary-token'
      : 'text-base sm:text-lg leading-snug text-secondary-token line-clamp-2';

  const avatarSizeMap = {
    sm: 'display-sm',
    md: 'display-lg',
    lg: 'display-xl',
    xl: 'display-2xl',
  } as const;

  const avatarContent = (
    <div className='rounded-full p-[2px] ring-1 ring-black/5 dark:ring-white/6 shadow-sm'>
      <Avatar
        src={artist.image_url || ''}
        alt={artist.name}
        name={artist.name}
        size={avatarSizeMap[avatarSize]}
        priority
        verified={false}
        className='ring-0 shadow-none'
      />
    </div>
  );

  return (
    <div
      className={`flex flex-col items-center space-y-3 sm:space-y-4 text-center ${className}`}
    >
      {linkToProfile ? (
        <Link
          href={`/${artist.handle}`}
          className='rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2'
          aria-label={`Go to ${artist.name}'s profile`}
        >
          {avatarContent}
        </Link>
      ) : (
        avatarContent
      )}

      <div className='space-y-1.5 sm:space-y-2 max-w-md'>
        <ArtistName
          name={artist.name}
          handle={artist.handle}
          isVerified={artist.is_verified}
          size={nameSize}
        />

        <p className={subtitleClassName} itemProp='description'>
          {resolvedSubtitle}
        </p>

        {/* Hidden SEO elements */}
        <meta itemProp='jobTitle' content='Music Artist' />
        <meta itemProp='worksFor' content='Music Industry' />
        <meta itemProp='knowsAbout' content='Music, Art, Entertainment' />
      </div>
    </div>
  );
}
