'use client';

import { Button } from '@jovie/ui';
import { X } from 'lucide-react';
import Image from 'next/image';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import type { DspPresenceItem } from '@/app/app/(shell)/dashboard/presence/actions';
import { Icon } from '@/components/atoms/Icon';
import { DrawerSection } from '@/components/molecules/drawer/DrawerSection';
import { DrawerSurfaceCard } from '@/components/molecules/drawer/DrawerSurfaceCard';
import { EntitySidebarShell } from '@/components/molecules/drawer/EntitySidebarShell';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { ConfidenceBadge } from '@/features/dashboard/atoms/ConfidenceBadge';
import {
  DspProviderIcon,
  PROVIDER_LABELS,
} from '@/features/dashboard/atoms/DspProviderIcon';
import { MatchStatusBadge } from '@/features/dashboard/atoms/MatchStatusBadge';
import { MatchConfidenceBreakdown } from '@/features/dashboard/molecules/MatchConfidenceBreakdown';
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
    <DrawerSurfaceCard variant='card' className='overflow-hidden'>
      <div className='relative p-3.5'>
        <div className='absolute right-2.5 top-2.5'>
          <DrawerHeaderActions
            primaryActions={[
              {
                id: 'close-dsp-presence',
                label: 'Close details',
                icon: X,
                onClick: onClose,
              },
            ]}
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
            <div className='flex h-10 w-10 items-center justify-center rounded-full border border-subtle bg-surface-0'>
              <DspProviderIcon provider={item.providerId} size='lg' />
            </div>
          )}
          <div className='min-w-0 flex-1'>
            <div className='truncate text-[14px] font-[590] text-primary-token'>
              {item.externalArtistName ?? 'Unknown Artist'}
            </div>
            <div className='mt-0.5 flex items-center gap-1.5 text-[12px] text-tertiary-token'>
              <DspProviderIcon provider={item.providerId} size='sm' />
              <span>{label}</span>
            </div>
          </div>
        </div>
      </div>
    </DrawerSurfaceCard>
  );
}

function SidebarContent({ item }: { readonly item: DspPresenceItem }) {
  const isSuggested = item.status === 'suggested';
  const label = PROVIDER_LABELS[item.providerId];

  return (
    <div className='space-y-3'>
      <DrawerSection
        title='Match Status'
        className='space-y-1.5'
        surface='card'
      >
        <div className='space-y-2'>
          <div className='flex items-center justify-between'>
            <span className='text-[12px] text-tertiary-token'>Status</span>
            <MatchStatusBadge status={item.status} size='sm' />
          </div>
          <div className='flex items-center justify-between'>
            <span className='text-[12px] text-tertiary-token'>Confidence</span>
            <ConfidenceBadge score={item.confidenceScore} size='sm' />
          </div>
          <div className='flex items-center justify-between'>
            <span className='text-[12px] text-tertiary-token'>
              ISRC Matches
            </span>
            <span className='text-[12px] text-primary-token'>
              {item.matchingIsrcCount}
            </span>
          </div>
          {item.confirmedAt && (
            <div className='flex items-center justify-between'>
              <span className='text-[12px] text-tertiary-token'>Confirmed</span>
              <span className='text-[12px] text-primary-token'>
                {formatDate(item.confirmedAt)}
              </span>
            </div>
          )}
        </div>
      </DrawerSection>

      {item.confidenceBreakdown && (
        <DrawerSection
          title='Confidence Breakdown'
          className='space-y-1.5'
          surface='card'
        >
          <MatchConfidenceBreakdown
            breakdown={item.confidenceBreakdown}
            totalScore={item.confidenceScore}
          />
        </DrawerSection>
      )}

      <DrawerSection title='Actions' className='space-y-1.5' surface='card'>
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
                className='h-8 w-full justify-start rounded-full border-subtle bg-surface-0 px-3 text-[12px] font-[510]'
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
    useDspMatchActions({ profileId: profileId ?? '' });

  const isLoading = isConfirming || isRejecting;

  if (!profileId) return null;

  return (
    <div className='flex items-center gap-2'>
      <Button
        variant='ghost'
        size='sm'
        onClick={() => rejectMatch(matchId)}
        disabled={isLoading}
        className='h-8 flex-1 rounded-full border border-subtle bg-surface-0 text-[12px] font-[510]'
      >
        {isRejecting ? 'Rejecting...' : 'Reject'}
      </Button>
      <Button
        variant='primary'
        size='sm'
        onClick={() => confirmMatch(matchId)}
        disabled={isLoading}
        className='h-8 flex-1 rounded-full text-[12px] font-[510]'
      >
        {isConfirming ? 'Confirming...' : 'Confirm Match'}
      </Button>
    </div>
  );
}
