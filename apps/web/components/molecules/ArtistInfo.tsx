import Link from 'next/link';
import { ArtistName } from '@/components/atoms/ArtistName';
import { Avatar } from '@/components/molecules/Avatar';
import type { AvatarSize } from '@/components/profile/ProfilePhotoContextMenu';
import {
  ProfilePhotoContextMenu,
} from '@/components/profile/ProfilePhotoContextMenu';
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
    lg: { mobile: 'display-lg', desktop: 'display-xl' },
    xl: { mobile: 'display-xl', desktop: 'display-2xl' },
  } as const;

  const { mobile: mobileSize, desktop: desktopSize } =
    avatarSizeMap[avatarSize];

  const avatarContent = (
    <div className='rounded-full p-[2px] ring-1 ring-black/5 dark:ring-white/6 shadow-sm'>
      {/* Render mobile size by default, desktop size at sm breakpoint */}
      <div className='sm:hidden'>
        <Avatar
          src={artist.image_url || ''}
          alt={artist.name}
          name={artist.name}
          size={mobileSize}
          priority
          verified={false}
          className='ring-0 shadow-none'
        />
      </div>
      <div className='hidden sm:block'>
        <Avatar
          src={artist.image_url || ''}
          alt={artist.name}
          name={artist.name}
          size={desktopSize}
          priority
          verified={false}
          className='ring-0 shadow-none'
        />
      </div>
    </div>
  );

  return (
    <div
      className={`flex flex-col items-center space-y-3 sm:space-y-4 text-center ${className}`}
    >
      <ProfilePhotoContextMenu
        name={artist.name}
        sizes={photoDownloadSizes}
        allowDownloads={allowPhotoDownloads}
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
