import Link from 'next/link';
import type { ReactNode } from 'react';
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
  readonly viewport?: 'desktop' | 'mobile';
  readonly bodyLayout?: 'stacked' | 'split';
  readonly trailingContent?: ReactNode;
  readonly className?: string;
  /** Whether avatar should link to profile root (useful on deep link routes) */
  readonly linkToProfile?: boolean;
  /** Available download sizes for profile photo */
  readonly photoDownloadSizes?: AvatarSize[];
  /** Whether profile photo downloads are allowed */
  readonly allowPhotoDownloads?: boolean;
  readonly align?: 'center' | 'start';
}

export function ArtistInfo({
  artist,
  subtitle,
  avatarSize = 'xl',
  nameSize = 'lg',
  viewport = 'desktop',
  bodyLayout = 'stacked',
  trailingContent,
  className = '',
  linkToProfile = true,
  photoDownloadSizes = [],
  allowPhotoDownloads = false,
  align = 'center',
}: ArtistInfoProps) {
  const resolvedSubtitle =
    subtitle ?? artist.tagline ?? DEFAULT_PROFILE_TAGLINE;
  const subtitleClassName =
    resolvedSubtitle === DEFAULT_PROFILE_TAGLINE
      ? 'text-[12px] font-semibold leading-none tracking-[-0.01em] text-tertiary-token'
      : 'text-[13px] sm:text-[15px] font-[520] leading-[1.32] tracking-[-0.02em] text-secondary-token line-clamp-2';

  const avatarSizeMap = {
    sm: { mobile: 'lg', desktop: 'display-sm' },
    md: { mobile: 'xl', desktop: 'display-lg' },
    lg: { mobile: 'display-sm', desktop: 'display-xl' },
    xl: { mobile: 'display-md', desktop: 'display-2xl' },
  } as const;

  const resolvedAvatarSize = avatarSizeMap[avatarSize][viewport];

  const avatarResponsiveSizes = {
    lg: '64px',
    xl: '80px',
    'display-sm': '112px',
    'display-lg': '160px',
    'display-xl': '192px',
    'display-md': '128px',
    'display-2xl': '224px',
  }[resolvedAvatarSize];

  const avatarContent = (
    <div className='rounded-full border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg)] p-[3px] shadow-[var(--profile-pearl-shadow)] backdrop-blur-xl'>
      <Avatar
        src={artist.image_url || ''}
        alt={artist.name}
        name={artist.name}
        size={resolvedAvatarSize}
        priority
        verified={false}
        sizes={avatarResponsiveSizes}
        className='ring-0 shadow-none'
      />
    </div>
  );

  let alignmentClass: string;
  if (bodyLayout === 'split') {
    alignmentClass = 'items-center';
  } else if (align === 'start') {
    alignmentClass = 'items-start text-left';
  } else {
    alignmentClass = 'items-center text-center';
  }

  return (
    <div
      data-testid='profile-header'
      className={`flex flex-col space-y-2.5 sm:space-y-3 ${alignmentClass} ${className}`}
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

      {bodyLayout === 'split' ? (
        <div className='w-full max-w-[38rem]'>
          <div className='flex items-start justify-between gap-4'>
            <div className='min-w-0 space-y-1.5 text-left sm:space-y-2'>
              <ArtistName
                name={artist.name}
                handle={artist.handle}
                isVerified={artist.is_verified}
                size={nameSize}
                className='tracking-[-0.04em]'
              />

              <p className={subtitleClassName} itemProp='description'>
                {resolvedSubtitle}
              </p>

              {/* Hidden SEO elements */}
              <meta itemProp='jobTitle' content='Music Artist' />
              <meta itemProp='worksFor' content='Music Industry' />
              <meta itemProp='knowsAbout' content='Music, Art, Entertainment' />
            </div>

            {trailingContent ? (
              <div className='flex shrink-0 items-center justify-end gap-2 pt-1'>
                {trailingContent}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div
          className={`max-w-md space-y-1.5 sm:space-y-2 ${
            align === 'start' ? 'text-left' : 'text-center'
          }`}
        >
          <ArtistName
            name={artist.name}
            handle={artist.handle}
            isVerified={artist.is_verified}
            size={nameSize}
            className='tracking-[-0.04em]'
          />

          <p className={subtitleClassName} itemProp='description'>
            {resolvedSubtitle}
          </p>

          {/* Hidden SEO elements */}
          <meta itemProp='jobTitle' content='Music Artist' />
          <meta itemProp='worksFor' content='Music Industry' />
          <meta itemProp='knowsAbout' content='Music, Art, Entertainment' />
        </div>
      )}
    </div>
  );
}
