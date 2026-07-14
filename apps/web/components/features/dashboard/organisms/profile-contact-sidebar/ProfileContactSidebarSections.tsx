'use client';

import { Button, CommonDropdown, type CommonDropdownItem } from '@jovie/ui';
import {
  Check,
  Copy,
  ExternalLink,
  MoreVertical,
  Pencil,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { type PreviewPanelData } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { toast } from '@/components/feedback';
import {
  DrawerMediaThumb,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { useProfileHeaderParts } from '@/components/organisms/profile-sidebar/ProfileSidebarHeader';
import { DrawerHero } from '@/components/shell/DrawerHero';
import { ProfilePreviewBento } from '@/features/profile/ProfilePreviewBento';
import { UtmBuilderDialog } from '@/features/profile/UtmBuilderDialog';
import {
  buildPreviewArtistFromProfile,
  buildProfilePreviewLinks,
} from '@/features/profile/view-models';
import { copyToClipboard } from '@/hooks/useClipboard';
import type { LegacySocialLink } from '@/types/db';
import { ProfileSmartLinkAnalytics } from './ProfileSmartLinkAnalytics';

function toPreviewSocialLinks(
  links: PreviewPanelData['links']
): LegacySocialLink[] {
  const now = new Date().toISOString();
  return buildProfilePreviewLinks(links).map(link => ({
    id: link.id,
    platform: link.platform,
    url: link.url,
    title: link.title,
    order: 0,
    is_visible: link.isVisible,
    created_at: now,
    updated_at: now,
    artist_id: 'preview',
    clicks: 0,
  }));
}

export function ProfileBentoView({
  previewData,
  profileUrl,
  onClose,
  onEditProfile,
}: Readonly<{
  previewData: PreviewPanelData;
  profileUrl: string;
  onClose: () => void;
  onEditProfile: () => void;
}>) {
  const [utmOpen, setUtmOpen] = useState(false);

  const artist = buildPreviewArtistFromProfile({
    username: previewData.username,
    displayName: previewData.displayName,
    avatarUrl: previewData.avatarUrl,
    bio: previewData.bio,
  });
  const socialLinks = toPreviewSocialLinks(previewData.links);

  const handleCopyLink = useCallback(async () => {
    const copied = await copyToClipboard(profileUrl);
    if (copied) {
      toast.success('Profile link copied');
      return;
    }
    toast.error('Failed to copy link');
  }, [profileUrl]);

  const menuItems: CommonDropdownItem[] = [
    {
      type: 'action',
      id: 'open-link',
      label: 'Open Link',
      icon: <ExternalLink className='h-3.5 w-3.5' />,
      onClick: () =>
        globalThis.open(profileUrl, '_blank', 'noopener,noreferrer'),
    },
    {
      type: 'action',
      id: 'copy-link',
      label: 'Copy Link',
      icon: <Copy className='h-3.5 w-3.5' />,
      onClick: handleCopyLink,
    },
    {
      type: 'action',
      id: 'utm-builder',
      label: 'UTM Builder',
      icon: <SlidersHorizontal className='h-3.5 w-3.5' />,
      onClick: () => setUtmOpen(true),
    },
  ];

  return (
    <div className='flex min-h-0 flex-1 flex-col overflow-y-auto'>
      <ProfilePreviewBento
        artist={artist}
        socialLinks={socialLinks}
        genres={previewData.genres}
        profileHref={previewData.profilePath}
        showLiveBadge
        caption='Your Live Profile'
        phoneAlign='top'
        showBottomFade
        className='shrink-0'
        heroClassName='aspect-4/5 max-h-110 w-full pt-2'
        phoneFrameClassName='h-110 w-57'
        topRight={
          <div className='flex items-center gap-1.5'>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              aria-label='Close'
              onClick={onClose}
              className='h-6 w-6 rounded-full border border-white/12 bg-black/50 text-white backdrop-blur-md hover:bg-black/65 dark:text-white'
            >
              <X className='h-3.5 w-3.5' />
            </Button>
            <CommonDropdown
              items={menuItems}
              align='end'
              aria-label='Profile Actions'
              trigger={
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  aria-label='Profile Actions'
                  className='h-6 w-6 rounded-full border border-white/12 bg-black/50 text-white backdrop-blur-md hover:bg-black/65 dark:text-white'
                >
                  <MoreVertical className='h-3.5 w-3.5' />
                </Button>
              }
            />
          </div>
        }
        footer={
          <div className='space-y-2 px-1.5 pb-1.5 pt-1.5 lg:px-0 lg:pb-0'>
            <ProfileSmartLinkAnalytics profileUrl={profileUrl} variant='flat' />
            <Button
              type='button'
              variant='primary'
              onClick={onEditProfile}
              className='h-10 w-full rounded-xl text-xs font-caption tracking-tight'
            >
              <Pencil className='mr-2 h-3.5 w-3.5' aria-hidden='true' />
              Edit Profile
            </Button>
          </div>
        }
      />
      <UtmBuilderDialog
        open={utmOpen}
        onClose={() => setUtmOpen(false)}
        baseUrl={profileUrl}
      />
    </div>
  );
}

export function ProfileSidebarHeaderCard({
  previewData,
  profileUrl,
  onClose,
  onDone,
  overflowActions,
}: Readonly<{
  previewData: PreviewPanelData;
  profileUrl: string;
  onClose: () => void;
  onDone?: () => void;
  overflowActions: ReturnType<typeof useProfileHeaderParts>['overflowActions'];
}>) {
  const primaryLabel =
    previewData.displayName?.trim() || `@${previewData.username}`;
  const secondaryLabel =
    previewData.displayName?.trim() &&
    previewData.displayName !== previewData.username
      ? `@${previewData.username}`
      : previewData.profilePath;
  const detailChips = [
    previewData.location?.trim() || null,
    `${previewData.links.length} link${previewData.links.length === 1 ? '' : 's'}`,
  ].filter(Boolean);
  const fallbackLabel = primaryLabel.replace(/^@/, '').charAt(0).toUpperCase();

  return (
    <DrawerSurfaceCard
      className='overflow-hidden'
      testId='profile-contact-header-card'
    >
      <div className='relative'>
        <div className='absolute right-2.5 top-2.5 z-10'>
          <DrawerHeaderActions
            primaryActions={
              onDone
                ? [
                    {
                      id: 'done',
                      label: 'Done',
                      icon: Check,
                      onClick: onDone,
                    },
                  ]
                : []
            }
            overflowActions={overflowActions}
            onClose={onClose}
          />
        </div>
        <DrawerHero
          title={primaryLabel}
          subtitle={secondaryLabel}
          stableLayout
          titleLineClamp={1}
          subtitleLineClamp={1}
          reserveSubtitleSlot
          reserveMetaSlot
          metaOverflow='scroll'
          artwork={
            <DrawerMediaThumb
              src={previewData.avatarUrl}
              alt={primaryLabel}
              sizeClassName='h-15 w-15 rounded-xl'
              sizes='60px'
              fallback={
                <span className='text-lg font-semibold text-secondary-token'>
                  {fallbackLabel}
                </span>
              }
            />
          }
          meta={
            <div className='flex items-center gap-2 text-2xs text-tertiary-token'>
              {detailChips.map(detail => (
                <span key={detail}>{detail}</span>
              ))}
            </div>
          }
          className='[&_h2]:pr-9'
        />
        <ProfileSmartLinkAnalytics profileUrl={profileUrl} variant='flat' />
      </div>
    </DrawerSurfaceCard>
  );
}
