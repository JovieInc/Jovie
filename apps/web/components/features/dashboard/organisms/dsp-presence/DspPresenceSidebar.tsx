'use client';

// @coverage-via apps/web/tests/unit/dashboard/DspPresenceSidebar.test.tsx

import { Button, ConfirmDialog } from '@jovie/ui';

import { useCallback, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import type { DspPresenceItem } from '@/app/app/(shell)/dashboard/presence/actions';
import { Icon } from '@/components/atoms/Icon';
import { toast } from '@/components/feedback';
import { DrawerPropertyRow } from '@/components/molecules/drawer/DrawerPropertyRow';
import { DrawerSection } from '@/components/molecules/drawer/DrawerSection';
import {
  EntityHeader,
  EntityHeaderThumbnail,
} from '@/components/molecules/drawer/EntityHeader';
import { EntitySidebarShell } from '@/components/molecules/drawer/EntitySidebarShell';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DspQuietRow } from '@/components/molecules/inspector/DspQuietRow';
import {
  DspProviderIcon,
  PROVIDER_LABELS,
} from '@/features/dashboard/atoms/DspProviderIcon';
import { MatchStatusBadge } from '@/features/dashboard/atoms/MatchStatusBadge';
import { useDspMatchActions } from '@/features/dashboard/organisms/dsp-matches/hooks';

interface DspPresenceSidebarProps {
  readonly item: DspPresenceItem | null;
  readonly onClose: () => void;
}

function formatDate(date: string | null): string {
  if (!date) return 'Never';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

export function DspPresenceSidebar({ item, onClose }: DspPresenceSidebarProps) {
  const isOpen = item !== null;
  const label = item ? PROVIDER_LABELS[item.providerId] : '';

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel={`${label} profile details`}
      scrollStrategy='shell'
      workspaceSurface='flat'
      entityHeaderSurface='flat'
      onClose={onClose}
      headerMode='minimal'
      hideMinimalHeaderBar
      isEmpty={!item}
      emptyMessage='Select a platform to view details.'
      entityHeader={
        item ? <SidebarEntityHeader item={item} onClose={onClose} /> : undefined
      }
    >
      {item && <SidebarContent item={item} />}
    </EntitySidebarShell>
  );
}

function SidebarEntityHeader({
  item,
  onClose,
}: {
  readonly item: DspPresenceItem;
  readonly onClose: () => void;
}) {
  const label = PROVIDER_LABELS[item.providerId];

  return (
    <EntityHeader
      layout='grid'
      className='px-3 pb-2 pt-3'
      thumbnail={
        <EntityHeaderThumbnail
          variant='person'
          name={item.externalArtistName ?? label}
          src={item.externalArtistImageUrl}
        />
      }
      title={item.externalArtistName ?? 'Unknown Artist'}
      subtitle={
        <span className='flex min-w-0 items-center gap-1.5'>
          <DspProviderIcon provider={item.providerId} size='sm' />
          <span className='truncate'>{label}</span>
        </span>
      }
      stableLayout
      titleLineClamp={1}
      subtitleLineClamp={1}
      reserveSubtitleSlot
      reserveMetaSlot={false}
      metaOverflow='scroll'
      actions={
        <DrawerHeaderActions
          primaryActions={[]}
          overflowActions={[]}
          onClose={onClose}
        />
      }
      data-testid='dsp-presence-entity-header'
    />
  );
}

function getMatchSourceLabel(matchSource: string | null): string {
  switch (matchSource) {
    case 'manual':
      return 'Linked manually';
    case 'musicfetch':
      return 'Discovered via Spotify';
    case 'isrc_discovery':
      return 'Verified by ISRC matching';
    case 'backfill':
      return 'Imported from profile';
    default:
      return 'Linked';
  }
}

function SidebarContent({ item }: { readonly item: DspPresenceItem }) {
  const dashboardData = useDashboardData();
  const profileId = dashboardData.selectedProfile?.id;
  const isSuggested = item.status === 'suggested';
  const isLinked =
    item.status === 'confirmed' ||
    item.status === 'auto_confirmed' ||
    item.matchSource === 'manual';
  const label = PROVIDER_LABELS[item.providerId];

  return (
    <div className='space-y-3 px-3 pb-3'>
      {item.externalArtistUrl ? (
        <DrawerSection sectionKind='links'>
          <DspQuietRow
            label={`View On ${label}`}
            href={item.externalArtistUrl}
            icon={<DspProviderIcon provider={item.providerId} size='sm' />}
          />
        </DrawerSection>
      ) : null}
      <DrawerSection
        title='Match Status'
        sectionKind='facts'
        collapsible={false}
      >
        <dl>
          <DrawerPropertyRow
            definitionList
            label='Status'
            value={<MatchStatusBadge status={item.status} size='sm' />}
          />
          <DrawerPropertyRow
            definitionList
            label='Source'
            value={getMatchSourceLabel(item.matchSource)}
          />
          {item.matchingIsrcCount > 0 ? (
            <DrawerPropertyRow
              definitionList
              label='Tracks Verified'
              value={item.matchingIsrcCount}
            />
          ) : null}
          {item.confirmedAt ? (
            <DrawerPropertyRow
              definitionList
              label='Confirmed'
              value={formatDate(item.confirmedAt)}
            />
          ) : null}
          {!item.externalArtistImageUrl ? (
            <DrawerPropertyRow
              definitionList
              label='Profile Image'
              value='Missing'
            />
          ) : null}
        </dl>
      </DrawerSection>

      {profileId && (isSuggested || isLinked) ? (
        <DrawerSection sectionKind='details'>
          {isSuggested ? (
            <SuggestedMatchActions matchId={item.matchId} />
          ) : (
            <RemovePlatformAction
              matchId={item.matchId}
              providerLabel={label}
              profileId={profileId}
            />
          )}
        </DrawerSection>
      ) : null}
    </div>
  );
}

function SuggestedMatchActions({ matchId }: { readonly matchId: string }) {
  const dashboardData = useDashboardData();
  const profileId = dashboardData.selectedProfile?.id;

  const { confirmMatch, rejectMatch, isConfirming, isRejecting } =
    useDspMatchActions({
      profileId: profileId ?? '',
    });

  const isLoading = isConfirming || isRejecting;

  if (!profileId) return null;

  return (
    <div className='flex items-center gap-2'>
      <Button
        variant='ghost'
        size='sm'
        onClick={() => rejectMatch(matchId)}
        disabled={isLoading}
        className='flex-1'
      >
        {isRejecting ? 'Rejecting...' : 'Reject'}
      </Button>
      <Button
        variant='primary'
        size='sm'
        onClick={() => confirmMatch(matchId)}
        disabled={isLoading}
        className='flex-1'
      >
        {isConfirming ? 'Confirming...' : 'Confirm Match'}
      </Button>
    </div>
  );
}

function RemovePlatformAction({
  matchId,
  providerLabel,
  profileId,
}: {
  readonly matchId: string;
  readonly providerLabel: string;
  readonly profileId: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { rejectMatch, isRejecting } = useDspMatchActions({
    profileId,
    onRejectSuccess: () => {
      toast.success(`${providerLabel} removed`);
      setConfirmOpen(false);
    },
    onError: () => {
      toast.error(`Failed to remove ${providerLabel}. Please try again.`);
    },
  });

  const handleConfirm = useCallback(() => {
    rejectMatch(matchId, 'user_disconnected');
  }, [matchId, rejectMatch]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (isRejecting) return;
      setConfirmOpen(open);
    },
    [isRejecting]
  );

  return (
    <>
      <Button
        variant='ghost'
        size='sm'
        destructive
        onClick={() => setConfirmOpen(true)}
        disabled={isRejecting}
        className='w-full justify-start'
        data-testid='presence-remove-platform'
      >
        <Icon name='Trash2' className='mr-1.5 h-3.5 w-3.5' />
        {isRejecting ? 'Removing...' : 'Remove Platform'}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={handleOpenChange}
        title={`Remove ${providerLabel}?`}
        description='Removing this platform link stops sync updates until you add it again.'
        confirmLabel='Remove'
        variant='destructive'
        onConfirm={handleConfirm}
      />
    </>
  );
}
