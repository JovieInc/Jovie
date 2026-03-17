'use client';

import { Button } from '@jovie/ui';
import Image from 'next/image';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import type { DspPresenceItem } from '@/app/app/(shell)/dashboard/presence/actions';
import { Icon } from '@/components/atoms/Icon';
import { DrawerSection } from '@/components/molecules/drawer/DrawerSection';
import { EntitySidebarShell } from '@/components/molecules/drawer/EntitySidebarShell';
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
      title={label}
      onClose={onClose}
      isEmpty={!item}
      emptyMessage='Select a platform to view details.'
      entityHeader={item ? <SidebarEntityHeader item={item} /> : undefined}
    >
      {item && <SidebarContent item={item} />}
    </EntitySidebarShell>
  );
}

function SidebarEntityHeader({ item }: { readonly item: DspPresenceItem }) {
  const label = PROVIDER_LABELS[item.providerId];

  return (
    <div className='flex items-center gap-3'>
      {item.externalArtistImageUrl ? (
        <div className='relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-(--linear-border-subtle) bg-(--linear-bg-surface-0)'>
          <Image
            src={item.externalArtistImageUrl}
            alt={item.externalArtistName ?? label}
            fill
            sizes='56px'
            className='object-cover'
            unoptimized={isExternalDspImage(item.externalArtistImageUrl)}
          />
        </div>
      ) : (
        <div className='flex h-14 w-14 items-center justify-center rounded-full border border-(--linear-border-subtle) bg-(--linear-bg-surface-0)'>
          <DspProviderIcon provider={item.providerId} size='lg' />
        </div>
      )}
      <div className='min-w-0 flex-1'>
        <div className='truncate text-[15px] font-[590] text-(--linear-text-primary)'>
          {item.externalArtistName ?? 'Unknown Artist'}
        </div>
        <div className='mt-0.5 flex items-center gap-2 text-[13px] text-(--linear-text-tertiary)'>
          <DspProviderIcon provider={item.providerId} size='sm' />
          <span>{label}</span>
        </div>
      </div>
    </div>
  );
}

function SidebarContent({ item }: { readonly item: DspPresenceItem }) {
  const isSuggested = item.status === 'suggested';
  const label = PROVIDER_LABELS[item.providerId];

  return (
    <>
      {/* Match Status */}
      <DrawerSection title='Match Status'>
        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <span className='text-[13px] text-(--linear-text-tertiary)'>
              Status
            </span>
            <MatchStatusBadge status={item.status} size='sm' />
          </div>
          <div className='flex items-center justify-between'>
            <span className='text-[13px] text-(--linear-text-tertiary)'>
              Confidence
            </span>
            <ConfidenceBadge score={item.confidenceScore} size='sm' />
          </div>
          <div className='flex items-center justify-between'>
            <span className='text-[13px] text-(--linear-text-tertiary)'>
              ISRC Matches
            </span>
            <span className='text-[13px] text-(--linear-text-primary)'>
              {item.matchingIsrcCount}
            </span>
          </div>
          {item.confirmedAt && (
            <div className='flex items-center justify-between'>
              <span className='text-[13px] text-(--linear-text-tertiary)'>
                Confirmed
              </span>
              <span className='text-[13px] text-(--linear-text-primary)'>
                {formatDate(item.confirmedAt)}
              </span>
            </div>
          )}
        </div>
      </DrawerSection>

      {/* Confidence Breakdown */}
      {item.confidenceBreakdown && (
        <DrawerSection title='Confidence Breakdown'>
          <MatchConfidenceBreakdown
            breakdown={item.confidenceBreakdown}
            totalScore={item.confidenceScore}
          />
        </DrawerSection>
      )}

      {/* Actions */}
      <DrawerSection title='Actions'>
        <div className='space-y-2'>
          {item.externalArtistUrl && (
            <a
              href={item.externalArtistUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='flex w-full'
            >
              <Button
                variant='secondary'
                size='sm'
                className='w-full text-[13px]'
              >
                <Icon name='ExternalLink' className='mr-1.5 h-3.5 w-3.5' />
                View on {label}
              </Button>
            </a>
          )}

          {isSuggested && <SuggestedMatchActions matchId={item.matchId} />}
        </div>
      </DrawerSection>
    </>
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
        className='flex-1 text-[13px]'
      >
        {isRejecting ? 'Rejecting...' : 'Reject'}
      </Button>
      <Button
        variant='primary'
        size='sm'
        onClick={() => confirmMatch(matchId)}
        disabled={isLoading}
        className='flex-1 text-[13px]'
      >
        {isConfirming ? 'Confirming...' : 'Confirm Match'}
      </Button>
    </div>
  );
}
