'use client';

import { Button } from '@jovie/ui';
import { Check, UserRound } from 'lucide-react';
import Link from 'next/link';
import { type PreviewPanelData } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import {
  DrawerMediaThumb,
  DrawerSurfaceCard,
  EntityHeaderCard,
} from '@/components/molecules/drawer';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { useProfileHeaderParts } from '@/components/organisms/profile-sidebar/ProfileSidebarHeader';
import { DrawerHero } from '@/components/shell/DrawerHero';
import { APP_ROUTES } from '@/constants/routes';
import { ProfileSmartLinkAnalytics } from './ProfileSmartLinkAnalytics';

/**
 * Read-only profile summary for the explicitly opened chat rail. Profile
 * editing and connection management live in the Connections workspace; chat
 * only needs a compact identity, share link, and a single clear hand-off.
 */
export function ProfileBentoView({
  previewData,
  profileUrl,
  onManageConnections,
  onEditProfile: _onEditProfile,
}: Readonly<{
  previewData: PreviewPanelData;
  profileUrl: string;
  onManageConnections?: () => void;
  /** Legacy callback retained while the editing rail is retired from chat. */
  onEditProfile?: () => void;
}>) {
  const title = previewData.displayName || `@${previewData.username}`;

  return (
    <div
      className='flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto px-3 pb-3 pt-2 lg:px-0 lg:pb-0'
      data-testid='profile-preview-summary'
    >
      <EntityHeaderCard
        image={
          <DrawerMediaThumb
            src={previewData.avatarUrl}
            alt={title}
            fallback={<UserRound className='h-5 w-5 text-tertiary-token' />}
            dimension={40}
            sizes='40px'
            sizeClassName='h-10 w-10 rounded-full'
          />
        }
        title={title}
        subtitle={`@${previewData.username}`}
        meta={
          previewData.bio ? (
            <span className='line-clamp-2 text-2xs leading-4 text-secondary-token'>
              {previewData.bio}
            </span>
          ) : undefined
        }
        stableLayout
        titleLineClamp={1}
        subtitleLineClamp={1}
        metaOverflow='wrap'
        data-testid='profile-preview-entity-header'
      />
      <ProfileSmartLinkAnalytics profileUrl={profileUrl} variant='flat' />
      {onManageConnections ? (
        <Button
          type='button'
          variant='secondary'
          size='sm'
          className='w-full'
          onClick={onManageConnections}
        >
          Manage in Connections
        </Button>
      ) : (
        <Button asChild variant='secondary' size='sm' className='w-full'>
          <Link href={APP_ROUTES.PROFILES}>Manage in Connections</Link>
        </Button>
      )}
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
          density='rail'
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
              dimension={44}
              sizeClassName='h-11 w-11 rounded-lg'
              sizes='44px'
              fallback={
                <span className='text-sm font-semibold text-secondary-token'>
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
