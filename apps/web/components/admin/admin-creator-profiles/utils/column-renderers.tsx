import type { CellContext } from '@tanstack/react-table';
import { Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { InlineIconButton } from '@/components/atoms/InlineIconButton';
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
        <span className='flex shrink-0 items-center gap-0.5'>
          <InlineIconButton
            aria-label={`Copy link for @${profile.username}`}
            fadeOnParentHover
            className='[&_svg]:h-3 [&_svg]:w-3'
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
          </InlineIconButton>
          <InlineIconButton
            href={profileUrl}
            target='_blank'
            rel='noopener noreferrer'
            aria-label={`Open profile for @${profile.username}`}
            fadeOnParentHover
            className='[&_svg]:h-3 [&_svg]:w-3'
            onClick={event => event.stopPropagation()}
          >
            <ExternalLink className='h-3 w-3' />
          </InlineIconButton>
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
    <span className='whitespace-nowrap text-[11px] font-[450] tabular-nums text-(--linear-text-tertiary)'>
      {createdAt
        ? createdAt.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })
        : '—'}
    </span>
  );
}
