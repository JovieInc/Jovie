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
  DrawerSection,
  DrawerTabs,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import type { ProviderKey } from '@/lib/discography/types';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { TrackMetaSummary } from './TrackMetaSummary';
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
  readonly onClose: () => void;
  readonly onBackToRelease?: (releaseId: string) => void;
}

export function TrackSidebar({
  track,
  isOpen,
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
    toast.success('Smart link copied');
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
        id: 'copy',
        label: isSmartLinkCopied ? 'Copied!' : 'Copy smart link',
        icon: Copy,
        activeIcon: Check,
        isActive: isSmartLinkCopied,
        onClick: handleCopySmartLink,
      },
      {
        id: 'open',
        label: 'Open smart link',
        icon: ExternalLink,
        onClick: () => {
          if (track.smartLinkPath) {
            globalThis.open(smartLinkUrl, '_blank', 'noopener,noreferrer');
          }
        },
      },
    ];
  }, [track, isSmartLinkCopied, handleCopySmartLink, smartLinkUrl]);

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Track details'
      data-testid='track-sidebar'
      title={track?.title ?? 'No track selected'}
      onClose={onClose}
      headerActions={
        <DrawerHeaderActions
          primaryActions={[]}
          overflowActions={overflowActions}
        />
      }
      isEmpty={!track}
      emptyMessage='Select a track to view its details.'
      entityHeader={
        track ? (
          <TrackMetaSummary
            title={track.title}
            trackNumber={track.trackNumber}
            discNumber={track.discNumber}
            durationMs={track.durationMs}
            isrc={track.isrc}
            isExplicit={track.isExplicit}
            variant='drawer'
            artwork={
              <DrawerMediaThumb
                src={track.releaseArtworkUrl}
                alt={`${track.releaseTitle} artwork`}
                sizeClassName='h-20 w-20'
                sizes='80px'
                fallback={
                  <Icon
                    name='Music'
                    className='h-7 w-7 text-(--linear-text-tertiary)'
                    aria-hidden='true'
                  />
                }
              />
            }
          />
        ) : undefined
      }
      tabs={
        track ? (
          <DrawerTabs
            value={activeTab}
            onValueChange={value => setActiveTab(value as TrackSidebarTab)}
            options={TRACK_SIDEBAR_TAB_OPTIONS}
            ariaLabel='Track sidebar tabs'
          />
        ) : undefined
      }
    >
      {track && (
        <div className='space-y-5'>
          {onBackToRelease && (
            <DrawerBackButton
              label={track.releaseTitle}
              onClick={handleBackToRelease}
            />
          )}

          {activeTab === 'details' && (
            <DrawerSection title='Smart link'>
              <CopyableUrlRow
                url={smartLinkUrl}
                size='lg'
                copyButtonTitle='Copy smart link'
                openButtonTitle='Open smart link'
                onCopySuccess={() => {
                  showSmartLinkCopied();
                }}
                onCopyError={() => {
                  toast.error('Failed to copy link');
                }}
              />
            </DrawerSection>
          )}

          {activeTab === 'details' && (
            <DrawerSection title='Actions'>
              <div className='space-y-1'>
                {track.isrc && (
                  <DrawerActionRow
                    onClick={handleCopyIsrc}
                    icon={<Hash className='h-3.5 w-3.5' />}
                    label='Copy ISRC'
                    trailing={
                      <span className='font-mono text-[10px] text-(--linear-text-tertiary)'>
                        {track.isrc}
                      </span>
                    }
                  />
                )}
              </div>
            </DrawerSection>
          )}

          {activeTab === 'platforms' && (
            <TrackPlatformLinksSection providers={streamingProviders} />
          )}
        </div>
      )}
    </EntitySidebarShell>
  );
}
