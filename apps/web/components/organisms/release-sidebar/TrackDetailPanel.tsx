'use client';

import { Copy } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { CopyableUrlRow } from '@/components/molecules/CopyableUrlRow';
import {
  DrawerActionRow,
  DrawerBackButton,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import type { ProviderKey } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { TrackMetaSummary } from './TrackMetaSummary';
import { TrackPlatformLinksSection } from './TrackPlatformLinksSection';

/** Track shape accepted by the detail panel (subset of TrackViewModel). */
export interface TrackForDetail {
  title: string;
  smartLinkPath: string;
  trackNumber: number;
  discNumber: number;
  durationMs: number | null;
  isrc: string | null;
  isExplicit: boolean;
  providers: Array<{ key: ProviderKey; label: string; url: string }>;
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

  return (
    <div className='space-y-3'>
      <DrawerBackButton label={releaseTitle} onClick={onBack} />

      <DrawerSurfaceCard
        className={cn(LINEAR_SURFACE.drawerCard, 'overflow-hidden')}
      >
        <div className='border-b border-(--linear-app-frame-seam) px-3 py-2'>
          <p className='text-[11px] font-caption leading-none text-tertiary-token'>
            Track
          </p>
        </div>
        <div className='p-3.5'>
          <TrackMetaSummary
            title={track.title}
            trackNumber={track.trackNumber}
            discNumber={track.discNumber}
            durationMs={track.durationMs}
            isrc={track.isrc}
            isExplicit={track.isExplicit}
            variant='drawer'
            showIsrc={false}
          />
        </div>
      </DrawerSurfaceCard>

      <DrawerSurfaceCard
        className={cn(LINEAR_SURFACE.drawerCard, 'overflow-hidden')}
      >
        <div className='border-b border-(--linear-app-frame-seam) px-3 py-2'>
          <p className='text-[11px] font-caption leading-none text-tertiary-token'>
            Smart link
          </p>
        </div>
        <div className='p-2.5'>
          <CopyableUrlRow
            url={smartLinkUrl}
            size='md'
            className='rounded-[8px]'
            surface='boxed'
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
      </DrawerSurfaceCard>

      {track.isrc && (
        <DrawerSurfaceCard
          className={cn(LINEAR_SURFACE.drawerCard, 'overflow-hidden')}
        >
          <div className='border-b border-(--linear-app-frame-seam) px-3 py-2'>
            <p className='text-[11px] font-caption leading-none text-tertiary-token'>
              Actions
            </p>
          </div>
          <div className='space-y-1.5 p-2.5'>
            <DrawerActionRow
              onClick={handleCopyIsrc}
              icon={<Copy className='h-3.5 w-3.5' />}
              label='Copy ISRC'
              trailing={
                <span className='font-mono text-[10px] text-tertiary-token'>
                  {track.isrc}
                </span>
              }
            />
          </div>
        </DrawerSurfaceCard>
      )}

      <TrackPlatformLinksSection providers={streamingProviders} />
    </div>
  );
}
