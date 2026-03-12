'use client';

import { Badge } from '@jovie/ui';
import { ArrowLeft, Copy, ExternalLink } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { CopyableUrlRow } from '@/components/molecules/CopyableUrlRow';
import { DrawerEmptyState, DrawerSection } from '@/components/molecules/drawer';
import { PROVIDER_LABELS } from '@/lib/discography/provider-labels';
import type { ProviderKey } from '@/lib/discography/types';
import { formatDuration } from '@/lib/utils/formatDuration';
import { getBaseUrl } from '@/lib/utils/platform-detection';

/** Track shape accepted by the detail panel (subset of TrackViewModel). */
export interface TrackForDetail {
  title: string;
  smartLinkPath: string;
  trackNumber: number;
  discNumber: number;
  durationMs: number | null;
  isrc: string | null;
  isExplicit: boolean;
  providers: Array<{ key: string; label: string; url: string }>;
}

interface TrackDetailPanelProps {
  readonly track: TrackForDetail;
  readonly releaseTitle: string;
  readonly onBack: () => void;
}

export function TrackDetailPanel({
  track,
  releaseTitle,
  onBack,
}: TrackDetailPanelProps) {
  const smartLinkUrl = `${getBaseUrl()}${track.smartLinkPath}`;
  const streamingProviders = track.providers.filter(p => p.url);

  const handleCopyIsrc = useCallback(() => {
    if (track.isrc) {
      navigator.clipboard.writeText(track.isrc).then(
        () => toast.success('ISRC copied'),
        () => toast.error('Failed to copy ISRC')
      );
    }
  }, [track.isrc]);

  const trackLabel =
    track.discNumber > 1
      ? `${track.discNumber}-${track.trackNumber}`
      : String(track.trackNumber);

  return (
    <div className='space-y-4'>
      {/* Back button */}
      <button
        type='button'
        onClick={onBack}
        className='flex items-center gap-1.5 rounded-[7px] border border-transparent px-1.5 py-1 text-[13px] text-(--linear-text-secondary) transition-[background-color,border-color,color] duration-150 hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-1) hover:text-primary-token focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-(--linear-bg-surface-1) focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
      >
        <ArrowLeft className='h-3.5 w-3.5' />
        <span className='max-w-[200px] truncate'>{releaseTitle}</span>
      </button>

      {/* Track title + metadata */}
      <div>
        <div className='flex items-center gap-2'>
          <span className='text-[11px] text-tertiary-token tabular-nums'>
            {trackLabel}.
          </span>
          <h3 className='text-[13px] font-[590] text-primary-token'>
            {track.title}
          </h3>
          {track.isExplicit && (
            <Badge
              variant='secondary'
              className='shrink-0 border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-1 py-0 text-[9px] text-(--linear-text-tertiary)'
            >
              E
            </Badge>
          )}
        </div>

        <div className='mt-1 flex items-center gap-3 text-[11px] text-secondary-token'>
          {track.durationMs != null && (
            <span className='tabular-nums'>
              {formatDuration(track.durationMs)}
            </span>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <DrawerSection>
        <p className='py-1 text-[11px] font-[510] uppercase tracking-[0.08em] text-(--linear-text-tertiary)'>
          Actions
        </p>
        <div className='space-y-1'>
          {track.isrc && (
            <button
              type='button'
              onClick={handleCopyIsrc}
              className='flex min-h-8 w-full items-center gap-2 rounded-[8px] border border-transparent px-2 py-1.5 text-[12px] text-(--linear-text-secondary) transition-[background-color,border-color,color] duration-150 hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-1) hover:text-primary-token focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-(--linear-bg-surface-1) focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
            >
              <Copy className='h-3.5 w-3.5 shrink-0' />
              <span>Copy ISRC</span>
              <span className='ml-auto font-mono text-[10px] text-(--linear-text-tertiary)'>
                {track.isrc}
              </span>
            </button>
          )}
          <CopyableUrlRow
            url={smartLinkUrl}
            copyButtonTitle='Copy smart link'
            openButtonTitle='Open smart link'
            onCopySuccess={() => {
              toast.success('Smart link copied');
            }}
            onCopyError={() => {
              toast.error('Failed to copy link');
            }}
          />
        </div>
      </DrawerSection>

      {/* Streaming links */}
      {streamingProviders.length > 0 && (
        <DrawerSection>
          <p className='py-1 text-[11px] font-[510] uppercase tracking-[0.08em] text-(--linear-text-tertiary)'>
            Available on
          </p>
          <div className='space-y-1'>
            {streamingProviders.map(provider => (
              <a
                key={provider.key}
                href={provider.url}
                target='_blank'
                rel='noopener noreferrer'
                className='flex min-h-8 items-center gap-2 rounded-[8px] border border-transparent px-2 py-1.5 text-[12px] text-(--linear-text-secondary) transition-[background-color,border-color,color] duration-150 hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-1) hover:text-primary-token focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-(--linear-bg-surface-1) focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
              >
                <ProviderIcon
                  provider={provider.key as ProviderKey}
                  className='h-4 w-4'
                  aria-label={PROVIDER_LABELS[provider.key] ?? provider.label}
                />
                <span>{PROVIDER_LABELS[provider.key] ?? provider.label}</span>
                <ExternalLink className='ml-auto h-3 w-3 text-(--linear-text-tertiary)' />
              </a>
            ))}
          </div>
        </DrawerSection>
      )}

      {streamingProviders.length === 0 && (
        <DrawerSection>
          <p className='py-1 text-[11px] font-[510] uppercase tracking-[0.08em] text-(--linear-text-tertiary)'>
            Available on
          </p>
          <DrawerEmptyState
            message='No platform links available for this track.'
            className='min-h-[96px]'
          />
        </DrawerSection>
      )}
    </div>
  );
}
