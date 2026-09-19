'use client';

import {
  getPlatformIconMetadata,
  SocialIcon,
} from '@/components/atoms/SocialIcon';
import { Avatar } from '@/components/molecules/Avatar';
import {
  getPresenceEntityName,
  getPresenceIdentityPhoto,
  getPresencePlatformLabel,
  identityPhotoAlt,
  identityPhotoSourceLabel,
  type PresenceIdentitySubject,
} from '@/lib/profile-surfaces/presence-identity';
import { cn } from '@/lib/utils';

interface PresenceIdentityPhotoProps {
  readonly subject: PresenceIdentitySubject;
  readonly artistName: string;
  readonly size?: 'lg' | 'xl';
  readonly showSource?: boolean;
  readonly className?: string;
}

function ProviderBadge({
  platform,
  label,
}: Readonly<{ platform: string; label: string }>) {
  const metadata = getPlatformIconMetadata(platform);
  return (
    <span
      className='absolute -bottom-0.5 -right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-subtle bg-surface-1 text-primary-token'
      aria-hidden
    >
      <span
        className='inline-flex'
        style={metadata ? { color: `#${metadata.hex}` } : undefined}
      >
        <SocialIcon platform={platform} className='h-2.5 w-2.5' aria-hidden />
      </span>
      <span className='sr-only'>{`${label} provider`}</span>
    </span>
  );
}

export function PresenceIdentityPhoto({
  subject,
  artistName,
  size = 'lg',
  showSource = false,
  className,
}: PresenceIdentityPhotoProps) {
  const photo = getPresenceIdentityPhoto(subject);
  const entityName = getPresenceEntityName(subject, artistName);
  const platformLabel = getPresencePlatformLabel(subject);
  const alt = identityPhotoAlt(entityName, platformLabel, photo);
  const showVerified = photo.verified && photo.kind === 'profile';

  return (
    <span
      role='img'
      aria-label={alt}
      className={cn('relative inline-flex shrink-0', className)}
      data-testid='presence-identity-photo'
      data-photo-kind={photo.kind}
      data-photo-source={photo.source}
      data-photo-verified={showVerified ? 'true' : 'false'}
      data-photo-freshness={photo.freshness}
    >
      <Avatar
        src={photo.url}
        alt={alt}
        name={entityName}
        size={size}
        shape={photo.kind === 'generic' ? 'artwork' : 'person'}
        verified={false}
        className='bg-surface-0'
      />
      <ProviderBadge platform={subject.platform} label={platformLabel} />
      {showSource ? (
        <span className='sr-only'>
          {identityPhotoSourceLabel(photo)}
          {photo.observedAt ? ` · Observed ${photo.observedAt}` : ''}
        </span>
      ) : null}
    </span>
  );
}
