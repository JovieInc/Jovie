'use client';

// @coverage-via apps/web/components/features/library/StatefulAssetSlot.test.tsx
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import {
  getLibraryItemKind,
  type LibraryReleaseAsset,
} from '@/app/app/(shell)/library/library-data';
import { toast } from '@/components/feedback';
import { InspectorSection } from '@/components/molecules/inspector';
import {
  buildLibraryViewRoute,
  buildReleaseDownloadsRoute,
} from '@/constants/routes';
import { SUPPORTED_IMAGE_MIME_TYPES } from '@/lib/images/config';
import type { LibraryDownloadView } from '@/lib/library/post-release-types';
import { projectLibraryInspectorAssetSlot } from '@/lib/library/stateful-asset-slot';
import { StatefulAssetSlot } from './StatefulAssetSlot';

const IMAGE_ACCEPT = SUPPORTED_IMAGE_MIME_TYPES.join(',');
const SLOT_SECTIONS = [
  ['artwork', 'Artwork', 'Drop artwork', 'JPEG, PNG, WebP, or AVIF.'],
  ['video', 'Video', 'Add video', 'Connect a video to this object.'],
  ['docs', 'Documents', 'Add document', 'Ideas, scripts, and one-sheets.'],
  ['stems', 'Stems', 'Add stems', 'Promo downloads and stem packs.'],
] as const;

function releaseIdForAsset(asset: LibraryReleaseAsset): string | null {
  if (getLibraryItemKind(asset) === 'release') return asset.id;
  if (asset.linkedReleaseId) return asset.linkedReleaseId;
  return asset.source?.provider === 'discography'
    ? asset.source.canonicalId
    : null;
}

async function uploadLibraryArtwork(releaseId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(
    `/api/images/artwork/upload?releaseId=${encodeURIComponent(releaseId)}`,
    { method: 'POST', body: formData }
  );
  const body = (await response.json().catch(() => ({}))) as {
    readonly artworkUrl?: string;
    readonly message?: string;
    readonly error?: string;
  };
  if (!response.ok || !body.artworkUrl) {
    throw new Error(body.message ?? body.error ?? 'Artwork upload failed');
  }
  return body.artworkUrl;
}

export function LibraryInspectorAssetSlots({
  asset,
  downloads,
  disabled = false,
  onArtworkUploaded,
}: {
  readonly asset: LibraryReleaseAsset;
  readonly downloads: readonly LibraryDownloadView[];
  readonly disabled?: boolean;
  readonly onArtworkUploaded?: (assetId: string, artworkUrl: string) => void;
}) {
  const releaseId = releaseIdForAsset(asset);
  const stems = useMemo(() => {
    if (!releaseId) return [];
    return downloads.filter(download => download.releaseId === releaseId);
  }, [downloads, releaseId]);
  const [localArtworkUrl, setLocalArtworkUrl] = useState(asset.artworkUrl);
  const artworkUrl = localArtworkUrl ?? asset.artworkUrl;
  const stemsHref = releaseId
    ? buildReleaseDownloadsRoute(releaseId)
    : undefined;

  const handleArtworkFile = useCallback(
    (file: File) => {
      if (!releaseId) return;
      void uploadLibraryArtwork(releaseId, file)
        .then(nextUrl => {
          setLocalArtworkUrl(nextUrl);
          onArtworkUploaded?.(asset.id, nextUrl);
          toast.success('Artwork attached');
        })
        .catch(error => {
          toast.error(
            error instanceof Error ? error.message : 'Artwork upload failed'
          );
        });
    },
    [asset.id, onArtworkUploaded, releaseId]
  );

  const slots = SLOT_SECTIONS.map(
    ([kind, title, acquireLabel, acquireHint]) => {
      const slot = projectLibraryInspectorAssetSlot(
        kind,
        { ...asset, artworkUrl },
        stems.length
      );
      const acquireHref =
        kind === 'video'
          ? buildLibraryViewRoute('videos')
          : kind === 'docs'
            ? buildLibraryViewRoute('documents')
            : stemsHref;
      return { kind, title, acquireLabel, acquireHint, slot, acquireHref };
    }
  );
  const addTargets = slots.filter(
    ({ kind, slot, acquireHref }) =>
      slot.occupancy === 'empty' && kind !== 'artwork' && Boolean(acquireHref)
  );

  return (
    <div data-testid='library-inspector-asset-slots' className='space-y-4'>
      {slots.map(
        ({ kind, title, acquireLabel, acquireHint, slot, acquireHref }) => {
          // Empty media-type buckets disappear; only artwork keeps its inline
          // upload affordance because it is the object's primary visual file.
          if (slot.occupancy === 'empty' && kind !== 'artwork') {
            return null;
          }

          return (
            <InspectorSection key={kind} title={title}>
              <StatefulAssetSlot
                kind={kind}
                occupancy={slot.occupancy}
                cardinality={slot.cardinality}
                acquireMode={slot.acquireMode}
                testIdPrefix={`library-${kind}`}
                objectTitle={slot.objectTitle}
                objectSubtitle={slot.objectSubtitle}
                previewSrc={kind === 'artwork' ? artworkUrl : undefined}
                accept={kind === 'artwork' ? IMAGE_ACCEPT : undefined}
                disabled={disabled || (kind === 'artwork' && !releaseId)}
                acquireLabel={acquireLabel}
                acquireHint={acquireHint}
                acquireHref={kind === 'artwork' ? undefined : acquireHref}
                onFile={
                  kind === 'artwork' && releaseId
                    ? handleArtworkFile
                    : undefined
                }
                addHref={kind === 'stems' ? stemsHref : undefined}
              >
                {kind === 'stems'
                  ? stems.map(stem => (
                      <p
                        key={stem.id}
                        className='truncate text-2xs text-secondary-token'
                      >
                        {stem.fileName}
                      </p>
                    ))
                  : null}
              </StatefulAssetSlot>
            </InspectorSection>
          );
        }
      )}
      {addTargets.length > 0 ? (
        <InspectorSection title='Add File'>
          <div className='space-y-0.5'>
            {addTargets.map(({ kind, acquireLabel, acquireHref }) => (
              <Link
                key={kind}
                href={acquireHref ?? '#'}
                data-testid={`library-${kind}-acquisition`}
                data-asset-slot-mode='acquisition'
                tabIndex={disabled ? -1 : undefined}
                className='group flex min-h-8 items-center gap-2 rounded-md px-2 text-xs text-secondary-token transition-colors duration-subtle hover:bg-surface-1 hover:text-primary-token focus-visible:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55'
              >
                <Plus
                  className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
                  aria-hidden='true'
                />
                <span className='min-w-0 flex-1 truncate'>{acquireLabel}</span>
              </Link>
            ))}
          </div>
        </InspectorSection>
      ) : null}
    </div>
  );
}
