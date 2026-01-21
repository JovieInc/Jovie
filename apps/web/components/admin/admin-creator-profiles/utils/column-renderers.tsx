import type { CellContext } from '@tanstack/react-table';
import {
  AvatarCell,
  DateCell,
  SocialLinksCell,
} from '@/components/organisms/table';
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

  return (
    <AvatarCell
      profileId={profile.id}
      username={profile.username}
      avatarUrl={profile.avatarUrl}
      displayName={displayName}
      verified={profile.isVerified}
      isFeatured={profile.isFeatured}
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
      filterPlatformType='social_media'
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
      filterPlatformType='music_streaming'
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
  const profile = row.original;
  return <DateCell date={profile.createdAt} />;
}
