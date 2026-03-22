import Link from 'next/link';
import { ArtistName } from '@/components/atoms/ArtistName';
import { Avatar } from '@/components/molecules/Avatar';
import { DEFAULT_PROFILE_TAGLINE } from '@/constants/app';
import { ProfilePhotoContextMenu } from '@/features/profile/ProfilePhotoContextMenu';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import { Artist } from '@/types/db';

interface ArtistInfoProps {
  readonly artist: Artist;
  readonly subtitle?: string;
  readonly avatarSize?: 'sm' | 'md' | 'lg' | 'xl';
  readonly nameSize?: 'sm' | 'md' | 'lg' | 'xl';
  readonly className?: string;
  /** Whether avatar should link to profile root (useful on deep link routes) */
  readonly linkToProfile?: boolean;
  /** Available download sizes for profile photo */
  readonly photoDownloadSizes?: AvatarSize[];
  /** Whether profile photo downloads are allowed */
  readonly allowPhotoDownloads?: boolean;
}

export function ArtistInfo({
  artist,
  subtitle,
  avatarSize = 'xl',
  nameSize = 'lg',
  className = '',
  linkToProfile = true,
  photoDownloadSizes = [],
  allowPhotoDownloads = false,
}: ArtistInfoProps) {
  const resolvedSubtitle =
    subtitle ?? artist.tagline ?? DEFAULT_PROFILE_TAGLINE;
  const subtitleClassName =
    resolvedSubtitle === DEFAULT_PROFILE_TAGLINE
      ? 'text-[11px] sm:text-xs font-normal tracking-[0.2em] uppercase leading-none text-tertiary-token'
      : 'text-base sm:text-lg leading-snug text-secondary-token line-clamp-2';

  // Use smaller avatar on mobile for large sizes to prevent layout dominance
  const avatarSizeMap = {
    sm: { mobile: 'display-sm', desktop: 'display-sm' },
    md: { mobile: 'display-md', desktop: 'display-lg' },
    lg: { mobile: 'display-md', desktop: 'display-xl' },
    xl: { mobile: 'display-lg', desktop: 'display-2xl' },
  } as const;

  const { desktop: desktopSize } = avatarSizeMap[avatarSize];

  const avatarResponsiveClassName = {
    sm: 'h-28 w-28 sm:h-28 sm:w-28',
    md: 'h-32 w-32 sm:h-40 sm:w-40',
    lg: 'h-32 w-32 sm:h-48 sm:w-48',
    xl: 'h-40 w-40 sm:h-56 sm:w-56',
  }[avatarSize];

  const avatarResponsiveSizes = {
    'display-sm': '(max-width: 639px) 112px, 112px',
    'display-md': '(max-width: 639px) 128px, 128px',
    'display-lg': '(max-width: 639px) 128px, 160px',
    'display-xl': '(max-width: 639px) 128px, 192px',
    'display-2xl': '(max-width: 639px) 160px, 224px',
  }[desktopSize];

  const avatarContent = (
    <div className='rounded-full p-[2px] ring-1 ring-black/5 dark:ring-white/6 shadow-sm'>
      <Avatar
        src={artist.image_url || ''}
        alt={artist.name}
        name={artist.name}
        size={desktopSize}
        priority
        verified={false}
        sizes={avatarResponsiveSizes}
        className={`ring-0 shadow-none ${avatarResponsiveClassName}`}
      />
    </div>
  );

  return (
    <div
      className={`flex flex-col items-center space-y-2.5 sm:space-y-3 text-center ${className}`}
    >
      <ProfilePhotoContextMenu
        name={artist.name}
        handle={artist.handle}
        sizes={photoDownloadSizes}
        allowDownloads={allowPhotoDownloads}
      >
        {linkToProfile ? (
          <Link
            href={`/${artist.handle}`}
            className='rounded-full focus-ring-themed'
            aria-label={`Go to ${artist.name}'s profile`}
          >
            {avatarContent}
          </Link>
        ) : (
          avatarContent
        )}
      </ProfilePhotoContextMenu>

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
