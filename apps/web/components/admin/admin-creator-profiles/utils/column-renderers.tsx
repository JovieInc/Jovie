import type { CellContext } from '@tanstack/react-table';
import { CalendarDays, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { AvatarCell, SocialLinksCell } from '@/components/organisms/table';
import { getProfileUrl } from '@/constants/domains';
import { copyToClipboard } from '@/hooks/useClipboard';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';

/**
 * Renders the avatar cell with profile information
 */
export function renderAvatarCell({
  row,
}: CellContext<AdminCreatorProfileRow, string>) {
  const profile = row.original;
  const displayName =
    'displayName' in profile ? (profile.displayName ?? null) : null;
  const profileUrl = getProfileUrl(profile.username);

  return (
    <AvatarCell
      profileId={profile.id}
      username={profile.username}
      avatarUrl={profile.avatarUrl}
      displayName={displayName}
      verified={profile.isVerified}
      isFeatured={profile.isFeatured}
      disableUsernameLink
      usernameActions={
        <span className='flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100'>
          <button
            type='button'
            className='rounded p-0.5 text-tertiary-token hover:bg-surface-2 hover:text-primary-token'
            aria-label={`Copy link for @${profile.username}`}
            onClick={event => {
              event.stopPropagation();
              copyToClipboard(profileUrl).then(ok => {
                if (ok) {
                  toast.success('Profile link copied', { duration: 2000 });
                } else {
                  toast.error('Failed to copy link');
                }
              });
            }}
          >
            <Copy className='h-3 w-3' />
          </button>
          <a
            href={profileUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='rounded p-0.5 text-tertiary-token hover:bg-surface-2 hover:text-primary-token'
            aria-label={`Open profile for @${profile.username}`}
            onClick={event => event.stopPropagation()}
          >
            <ExternalLink className='h-3 w-3' />
          </a>
        </span>
      }
    />
  );
}

/**
 * Renders the social media links cell
 */
export function renderSocialLinksCell({
  row,
}: CellContext<AdminCreatorProfileRow, AdminCreatorProfileRow['socialLinks']>) {
  const profile = row.original;
  return (
    <SocialLinksCell
      links={profile.socialLinks ?? null}
      filterPlatformType='social'
      maxLinks={3}
    />
  );
}

/**
 * Renders the music streaming links cell
 */
export function renderMusicLinksCell({
  row,
}: CellContext<AdminCreatorProfileRow, AdminCreatorProfileRow['socialLinks']>) {
  const profile = row.original;
  return (
    <SocialLinksCell
      links={profile.socialLinks ?? null}
      filterPlatformType='music'
      maxLinks={3}
    />
  );
}

/**
 * Renders the created date cell
 */
export function renderCreatedDateCell({
  row,
}: CellContext<AdminCreatorProfileRow, Date | null>) {
  const createdAt = row.original.createdAt;

  return (
    <span className='inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-[450] tabular-nums text-secondary-token'>
      <CalendarDays
        className='h-3.5 w-3.5 text-tertiary-token'
        aria-hidden='true'
      />
      {createdAt
        ? createdAt.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })
        : '—'}
    </span>
  );
}
