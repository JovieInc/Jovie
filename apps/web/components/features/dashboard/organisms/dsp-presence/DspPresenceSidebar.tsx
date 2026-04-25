'use client';

import { Button } from '@jovie/ui';

import Image from 'next/image';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import type { DspPresenceItem } from '@/app/app/(shell)/dashboard/presence/actions';
import { Icon } from '@/components/atoms/Icon';
import { DrawerSection } from '@/components/molecules/drawer/DrawerSection';
import { DrawerSurfaceCard } from '@/components/molecules/drawer/DrawerSurfaceCard';
import { EntitySidebarShell } from '@/components/molecules/drawer/EntitySidebarShell';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import {
  DspProviderIcon,
  PROVIDER_LABELS,
} from '@/features/dashboard/atoms/DspProviderIcon';
import { MatchStatusBadge } from '@/features/dashboard/atoms/MatchStatusBadge';
import { useDspMatchActions } from '@/features/dashboard/organisms/dsp-matches/hooks';
import { isExternalDspImage } from '@/lib/utils/dsp-images';

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
    <DrawerSurfaceCard variant='flat' className='overflow-hidden'>
      <div className='relative border-b border-[color-mix(in_oklab,var(--linear-app-shell-border)_72%,transparent)] px-3 py-2.5'>
        <div className='absolute right-2.5 top-2.5'>
          <DrawerHeaderActions
            primaryActions={[]}
            overflowActions={[]}
            onClose={onClose}
          />
        </div>
        <div className='flex items-center gap-2 pr-8'>
          {item.externalArtistImageUrl ? (
            <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-subtle bg-surface-0'>
              <Image
                src={item.externalArtistImageUrl}
                alt={item.externalArtistName ?? label}
                fill
                sizes='40px'
                className='object-cover'
                unoptimized={isExternalDspImage(item.externalArtistImageUrl)}
              />
            </div>
          ) : (
            <div className='relative flex h-10 w-10 items-center justify-center rounded-full border border-subtle bg-surface-0'>
              <DspProviderIcon provider={item.providerId} size='lg' />
              <div
                className='absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/60'
                role='img'
                aria-label='Profile image missing'
              >
                <Icon
                  name='Camera'
                  className='h-4 w-4 text-amber-600 dark:text-amber-400'
                />
              </div>
            </div>
          )}
          <div className='min-w-0 flex-1'>
            <div className='truncate text-sm font-semibold text-primary-token'>
              {item.externalArtistName ?? 'Unknown Artist'}
            </div>
            <div className='mt-0.5 flex items-center gap-1.5 text-xs text-tertiary-token'>
              <DspProviderIcon provider={item.providerId} size='sm' />
              <span>{label}</span>
            </div>
          </div>
        </div>
      </div>
    </DrawerSurfaceCard>
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
  const isSuggested = item.status === 'suggested';
  const label = PROVIDER_LABELS[item.providerId];

  return (
    <div className='space-y-2'>
      <DrawerSection title='Match Status' className='space-y-1.5'>
        <div className='space-y-2'>
          <div className='flex items-center justify-between'>
            <span className='text-xs text-tertiary-token'>Status</span>
            <MatchStatusBadge status={item.status} size='sm' />
          </div>
          <div className='flex items-center justify-between'>
            <span className='text-xs text-tertiary-token'>Source</span>
            <span className='text-xs text-primary-token'>
              {getMatchSourceLabel(item.matchSource)}
            </span>
          </div>
          {item.matchingIsrcCount > 0 && (
            <div className='flex items-center justify-between'>
              <span className='text-xs text-tertiary-token'>
                Tracks Verified
              </span>
              <span className='text-xs text-primary-token'>
                {item.matchingIsrcCount}
              </span>
            </div>
          )}
          {item.confirmedAt && (
            <div className='flex items-center justify-between'>
              <span className='text-xs text-tertiary-token'>Confirmed</span>
              <span className='text-xs text-primary-token'>
                {formatDate(item.confirmedAt)}
              </span>
            </div>
          )}
        </div>
      </DrawerSection>

      <DrawerSection
        title='Actions'
        className='space-y-1.5 border-t border-[color-mix(in_oklab,var(--linear-app-shell-border)_72%,transparent)] pt-2.5'
      >
        <div className='space-y-2'>
          {item.externalArtistUrl && (
            <a
              href={item.externalArtistUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='flex w-full'
            >
              <Button
                variant='ghost'
                size='sm'
                className='h-8 w-full justify-start rounded-full border-subtle bg-surface-0 px-3 text-xs font-caption'
              >
                <Icon name='ExternalLink' className='mr-1.5 h-3.5 w-3.5' />
                View on {label}
              </Button>
            </a>
          )}

          {isSuggested && <SuggestedMatchActions matchId={item.matchId} />}
        </div>
      </DrawerSection>
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
        className='h-8 flex-1 rounded-full border border-subtle bg-surface-0 text-xs font-caption'
      >
        {isRejecting ? 'Rejecting...' : 'Reject'}
      </Button>
      <Button
        variant='primary'
        size='sm'
        onClick={() => confirmMatch(matchId)}
        disabled={isLoading}
        className='h-8 flex-1 rounded-full text-xs font-caption'
      >
        {isConfirming ? 'Confirming...' : 'Confirm Match'}
      </Button>
    </div>
  );
}
