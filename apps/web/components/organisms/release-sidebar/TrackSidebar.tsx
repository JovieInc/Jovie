'use client';

/**
 * TrackSidebar Component
 *
 * A right drawer for displaying individual track details.
 * Opens when clicking a track in the release sidebar's track list
 * or when clicking a track row in "tracks" view mode.
 */

import { Check, Copy, ExternalLink, Hash } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/atoms/Icon';
import { CopyableUrlRow } from '@/components/molecules/CopyableUrlRow';
import {
  DrawerActionRow,
  DrawerBackButton,
  DrawerMediaThumb,
  DrawerSurfaceCard,
  DrawerTabs,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { EntityHeaderCard } from '@/components/molecules/drawer/EntityHeaderCard';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import type { ProviderKey } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/formatDuration';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { TrackPlatformLinksSection } from './TrackPlatformLinksSection';

type TrackSidebarTab = 'details' | 'platforms';

const TRACK_SIDEBAR_TAB_OPTIONS = [
  { value: 'details' as const, label: 'Details' },
  { value: 'platforms' as const, label: 'Platforms' },
];

export interface TrackSidebarData {
  id: string;
  title: string;
  slug: string;
  smartLinkPath: string;
  trackNumber: number;
  discNumber: number;
  durationMs: number | null;
  isrc: string | null;
  isExplicit: boolean;
  previewUrl: string | null;
  audioUrl: string | null;
  audioFormat: string | null;
  providers: Array<{ key: ProviderKey; label: string; url: string }>;
  releaseTitle: string;
  releaseArtworkUrl?: string | null;
  releaseId: string;
}

export interface TrackSidebarProps {
  readonly track: TrackSidebarData | null;
  readonly isOpen: boolean;
  readonly width?: number;
  readonly onClose: () => void;
  readonly onBackToRelease?: (releaseId: string) => void;
}

export function TrackSidebar({
  track,
  isOpen,
  width,
  onClose,
  onBackToRelease,
}: TrackSidebarProps) {
  const [isSmartLinkCopied, setIsSmartLinkCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TrackSidebarTab>('details');
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isrcCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const copyRef = copyTimeoutRef;
    const isrcRef = isrcCopyTimeoutRef;
    return () => {
      if (copyRef.current) clearTimeout(copyRef.current);
      if (isrcRef.current) clearTimeout(isrcRef.current);
    };
  }, []);

  useEffect(() => {
    setIsSmartLinkCopied(false);
    setActiveTab('details');
  }, [track?.id]);

  const smartLinkUrl = track ? `${getBaseUrl()}${track.smartLinkPath}` : '';

  const showSmartLinkCopied = useCallback(() => {
    toast.success('Track link copied');
    setIsSmartLinkCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(
      () => setIsSmartLinkCopied(false),
      2000
    );
  }, []);

  const handleCopySmartLink = useCallback(() => {
    if (!smartLinkUrl) return;
    navigator.clipboard.writeText(smartLinkUrl).then(
      () => {
        showSmartLinkCopied();
      },
      () => toast.error('Failed to copy link')
    );
  }, [showSmartLinkCopied, smartLinkUrl]);

  const handleCopyIsrc = useCallback(() => {
    if (!track?.isrc) return;
    navigator.clipboard.writeText(track.isrc).then(
      () => {
        toast.success('ISRC copied');
      },
      () => toast.error('Failed to copy ISRC')
    );
  }, [track]);

  const handleBackToRelease = useCallback(() => {
    if (track?.releaseId && onBackToRelease) {
      onBackToRelease(track.releaseId);
    }
  }, [track, onBackToRelease]);

  const streamingProviders = track?.providers.filter(p => p.url) ?? [];

  const overflowActions = useMemo<DrawerHeaderAction[]>(() => {
    if (!track) return [];
    return [
      {
        id: 'refresh-copy',
        label: isSmartLinkCopied ? 'Copied!' : 'Copy track link',
        icon: Copy,
        activeIcon: Check,
        isActive: isSmartLinkCopied,
        onClick: handleCopySmartLink,
      },
      {
        id: 'open',
        label: 'Open track link',
        icon: ExternalLink,
        onClick: () => {
          if (track.smartLinkPath) {
            globalThis.open(smartLinkUrl, '_blank', 'noopener,noreferrer');
          }
        },
      },
      ...(track.isrc
        ? [
            {
              id: 'copy-isrc',
              label: 'Copy ISRC',
              icon: Hash,
              onClick: handleCopyIsrc,
            } satisfies DrawerHeaderAction,
          ]
        : []),
    ];
  }, [
    track,
    isSmartLinkCopied,
    handleCopySmartLink,
    smartLinkUrl,
    handleCopyIsrc,
  ]);

  const primaryActions = useMemo<DrawerHeaderAction[]>(() => {
    if (!track) return [];
    return [
      {
        id: 'copy',
        label: isSmartLinkCopied ? 'Copied!' : 'Copy track link',
        icon: Copy,
        activeIcon: Check,
        isActive: isSmartLinkCopied,
        onClick: handleCopySmartLink,
      },
      {
        id: 'open',
        label: 'Open track link',
        icon: ExternalLink,
        onClick: () => {
          if (track.smartLinkPath) {
            globalThis.open(smartLinkUrl, '_blank', 'noopener,noreferrer');
          }
        },
      },
    ];
  }, [track, isSmartLinkCopied, handleCopySmartLink, smartLinkUrl]);

  const trackLabel = track
    ? track.discNumber > 1
      ? `${track.discNumber}-${track.trackNumber}`
      : String(track.trackNumber)
    : '';

  const trackHeaderCard = track ? (
    <DrawerSurfaceCard
      className={cn(LINEAR_SURFACE.sidebarCard, 'overflow-hidden')}
    >
      <div className='p-2.5'>
        <div className='flex items-start gap-2.5'>
          <DrawerMediaThumb
            src={track.releaseArtworkUrl}
            alt={`${track.releaseTitle} artwork`}
            sizeClassName='h-[68px] w-[68px] rounded-[10px]'
            sizes='68px'
            fallback={
              <Icon
                name='Music'
                className='h-7 w-7 text-tertiary-token'
                aria-hidden='true'
              />
            }
          />
          <EntityHeaderCard
            title={track.title}
            subtitle={
              <span className='flex items-center gap-1.5'>
                <span className='tabular-nums'>{trackLabel}.</span>
                {track.releaseTitle}
                {track.isExplicit && (
                  <span className='rounded-[4px] bg-surface-1 px-1 text-[9px] font-[510] text-tertiary-token'>
                    E
                  </span>
                )}
              </span>
            }
            meta={
              <div className='flex items-center gap-2 text-[10.5px] text-tertiary-token'>
                {track.durationMs != null && (
                  <span className='tabular-nums'>
                    {formatDuration(track.durationMs)}
                  </span>
                )}
                {track.isrc && (
                  <span className='font-mono text-[9.5px] tracking-[0.02em]'>
                    {track.isrc}
                  </span>
                )}
              </div>
            }
            className='min-w-0 flex-1'
            bodyClassName='pt-0'
          />
        </div>
      </div>
    </DrawerSurfaceCard>
  ) : undefined;

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      width={width}
      ariaLabel='Track details'
      data-testid='track-sidebar'
      title={track?.title ?? 'No track selected'}
      onClose={onClose}
      headerActions={
        <DrawerHeaderActions
          primaryActions={primaryActions}
          overflowActions={overflowActions}
          onClose={onClose}
        />
      }
      actionsInEntityHeader
      isEmpty={!track}
      emptyMessage='Select a track to view its details.'
    >
      {track && (
        <div className='space-y-3'>
          {onBackToRelease && (
            <DrawerBackButton
              label={track.releaseTitle}
              onClick={handleBackToRelease}
            />
          )}

          {trackHeaderCard}

          <div className='space-y-2.5 pt-0.5'>
            <div className='px-1.5'>
              <DrawerTabs
                value={activeTab}
                onValueChange={value => setActiveTab(value as TrackSidebarTab)}
                options={TRACK_SIDEBAR_TAB_OPTIONS}
                ariaLabel='Track sidebar tabs'
              />
            </div>

            <div className='space-y-2.5 p-2.5'>
              {activeTab === 'details' && (
                <DrawerSurfaceCard
                  className={cn(LINEAR_SURFACE.drawerCardSm, 'overflow-hidden')}
                >
                  <div className='border-b border-(--linear-app-frame-seam) px-3 py-2'>
                    <p className='text-[11px] font-[510] leading-none text-tertiary-token'>
                      Track link
                    </p>
                  </div>
                  <div className='p-2.5'>
                    <CopyableUrlRow
                      url={smartLinkUrl}
                      size='md'
                      surface='boxed'
                      copyButtonTitle='Copy track link'
                      openButtonTitle='Open track link'
                      onCopySuccess={() => {
                        showSmartLinkCopied();
                      }}
                      onCopyError={() => {
                        toast.error('Failed to copy link');
                      }}
                    />
                  </div>
                </DrawerSurfaceCard>
              )}

              {activeTab === 'details' && (
                <DrawerSurfaceCard
                  className={cn(LINEAR_SURFACE.drawerCardSm, 'overflow-hidden')}
                >
                  <div className='border-b border-(--linear-app-frame-seam) px-3 py-2'>
                    <p className='text-[11px] font-[510] leading-none text-tertiary-token'>
                      Actions
                    </p>
                  </div>
                  <div className='space-y-1.5 p-2.5'>
                    {track.isrc && (
                      <DrawerActionRow
                        onClick={handleCopyIsrc}
                        icon={<Hash className='h-3.5 w-3.5' />}
                        label='Copy ISRC'
                        trailing={
                          <span className='font-mono text-[10px] text-tertiary-token'>
                            {track.isrc}
                          </span>
                        }
                      />
                    )}
                  </div>
                </DrawerSurfaceCard>
              )}

              {activeTab === 'platforms' && (
                <TrackPlatformLinksSection providers={streamingProviders} />
              )}
            </div>
          </div>
        </div>
      )}
    </EntitySidebarShell>
  );
}
