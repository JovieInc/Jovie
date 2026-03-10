'use client';

import { Badge } from '@jovie/ui';
import { ArrowLeft, Copy, ExternalLink } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { CopyableUrlRow } from '@/components/molecules/CopyableUrlRow';
import { DrawerSection } from '@/components/molecules/drawer';
import { PROVIDER_LABELS } from '@/lib/discography/provider-labels';
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
        className='flex items-center gap-1.5 text-[13px] text-secondary-token hover:text-primary-token transition-colors rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary'
      >
        <ArrowLeft className='h-3.5 w-3.5' />
        <span className='truncate max-w-[200px]'>{releaseTitle}</span>
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
              className='shrink-0 bg-surface-2 px-1 py-0 text-[9px] text-tertiary-token'
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
        <p className='py-1 text-[11px] font-[510] uppercase tracking-[0.08em] text-secondary-token'>
          Actions
        </p>
        <div className='space-y-1'>
          {track.isrc && (
            <button
              type='button'
              onClick={handleCopyIsrc}
              className='flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-secondary-token hover:bg-surface-2/50 hover:text-primary-token transition-colors'
            >
              <Copy className='h-3.5 w-3.5 shrink-0' />
              <span>Copy ISRC</span>
              <span className='ml-auto font-mono text-[10px] text-tertiary-token'>
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
          <p className='py-1 text-[11px] font-[510] uppercase tracking-[0.08em] text-secondary-token'>
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
                <span>{PROVIDER_LABELS[provider.key] ?? provider.label}</span>
                <ExternalLink className='ml-auto h-3 w-3 text-tertiary-token' />
              </a>
            ))}
          </div>
        </DrawerSection>
      )}
    </div>
  );
}
