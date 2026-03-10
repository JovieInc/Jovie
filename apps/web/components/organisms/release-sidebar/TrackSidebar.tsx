'use client';

/**
 * TrackSidebar Component
 *
 * A right drawer for displaying individual track details.
 * Opens when clicking a track in the release sidebar's track list
 * or when clicking a track row in "tracks" view mode.
 */

import { Badge } from '@jovie/ui';
import { ArrowLeft, Check, Copy, ExternalLink, Hash } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/atoms/Icon';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { CopyableUrlRow } from '@/components/molecules/CopyableUrlRow';
import {
  DrawerSection,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { PROVIDER_LABELS } from '@/lib/discography/provider-labels';
import { formatDuration } from '@/lib/utils/formatDuration';
import { getBaseUrl } from '@/lib/utils/platform-detection';

/** Track data needed by the sidebar - subset of TrackViewModel plus parent release info */
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
  providers: Array<{ key: string; label: string; url: string }>;
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

  const trackLabel = (() => {
    if (!track) return '';
    if (track.discNumber > 1) return `${track.discNumber}-${track.trackNumber}`;
    return String(track.trackNumber);
  })();

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

  const headerActions = (
    <DrawerHeaderActions
      primaryActions={[]}
      overflowActions={overflowActions}
    />
  );

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Track details'
      data-testid='track-sidebar'
      title={track?.title ?? 'No track selected'}
      onClose={onClose}
      headerActions={headerActions}
      isEmpty={!track}
      emptyMessage='Select a track to view its details.'
      entityHeader={
        track ? (
          <div className='flex items-start gap-4'>
            <div className='min-w-0 flex-1 space-y-1.5'>
              <div className='flex items-center gap-2'>
                <span className='text-[13px] text-tertiary-token tabular-nums'>
                  {trackLabel}.
                </span>
                <h3 className='text-[15px] font-[590] text-primary-token'>
                  {track.title}
                </h3>
                {track.isExplicit && (
                  <Badge
                    variant='secondary'
                    className='shrink-0 bg-surface-2 px-1 py-0 text-[9px] text-tertiary-token'
                  >
                    E
                  </Badge>
                )}
              </div>
              <div className='flex items-center gap-3 text-[11px] text-secondary-token'>
                {track.durationMs != null && (
                  <span className='tabular-nums'>
                    {formatDuration(track.durationMs)}
                  </span>
                )}
                {track.isrc && (
                  <span className='font-mono text-[10px] text-tertiary-token'>
                    {track.isrc}
                  </span>
                )}
              </div>
            </div>
            {track.releaseArtworkUrl ? (
              <div className='relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-2 shadow-card'>
                <Image
                  src={track.releaseArtworkUrl}
                  alt={`${track.releaseTitle} artwork`}
                  fill
                  className='object-cover'
                  sizes='80px'
                />
              </div>
            ) : (
              <div className='relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-2 shadow-card'>
                <div className='flex h-full w-full items-center justify-center'>
                  <Icon
                    name='Music'
                    className='h-7 w-7 text-tertiary-token'
                    aria-hidden='true'
                  />
                </div>
              </div>
            )}
          </div>
        ) : undefined
      }
    >
      {track && (
        <div className='space-y-5'>
          {onBackToRelease && (
            <button
              type='button'
              onClick={handleBackToRelease}
              className='flex items-center gap-1.5 text-[13px] text-secondary-token hover:text-primary-token transition-colors rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary'
            >
              <ArrowLeft className='h-3.5 w-3.5' />
              <span className='truncate max-w-[200px]'>
                {track.releaseTitle}
              </span>
            </button>
          )}

          <DrawerSection>
            <p className='py-1 text-[11px] font-[510] uppercase tracking-[0.08em] text-tertiary-token'>
              Smart link
            </p>
            <CopyableUrlRow
              url={smartLinkUrl}
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

          <DrawerSection>
            <p className='py-1 text-[11px] font-[510] uppercase tracking-[0.08em] text-tertiary-token'>
              Actions
            </p>
            <div className='space-y-1'>
              {track.isrc && (
                <button
                  type='button'
                  onClick={handleCopyIsrc}
                  className='flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-secondary-token hover:bg-surface-2/50 hover:text-primary-token transition-colors'
                >
                  <Hash className='h-3.5 w-3.5 shrink-0' />
                  <span>Copy ISRC</span>
                  <span className='ml-auto font-mono text-[10px] text-tertiary-token'>
                    {track.isrc}
                  </span>
                </button>
              )}
            </div>
          </DrawerSection>

          {streamingProviders.length > 0 && (
            <DrawerSection>
              <p className='py-1 text-[11px] font-[510] uppercase tracking-[0.08em] text-tertiary-token'>
                Available on
              </p>
              <div className='space-y-1'>
                {streamingProviders.map(provider => (
                  <a
                    key={provider.key}
                    href={provider.url}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-secondary-token hover:bg-surface-2/50 hover:text-primary-token transition-colors'
                  >
                    <SocialIcon
                      platform={provider.key}
                      className='h-4 w-4 shrink-0'
                    />
                    <span>
                      {PROVIDER_LABELS[provider.key] ?? provider.label}
                    </span>
                    <ExternalLink className='ml-auto h-3 w-3 text-tertiary-token' />
                  </a>
                ))}
              </div>
            </DrawerSection>
          )}
        </div>
      )}
    </EntitySidebarShell>
  );
}
