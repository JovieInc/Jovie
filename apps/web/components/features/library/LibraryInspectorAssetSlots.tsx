'use client';

// @coverage-via apps/web/components/features/library/StatefulAssetSlot.test.tsx
import { useCallback, useMemo, useState } from 'react';
import {
  getLibraryItemKind,
  type LibraryReleaseAsset,
} from '@/app/app/(shell)/library/library-data';
import { toast } from '@/components/feedback';
import { DrawerSection } from '@/components/molecules/drawer';
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

  return (
    <div data-testid='library-inspector-asset-slots'>
      {SLOT_SECTIONS.map(([kind, title, acquireLabel, acquireHint]) => {
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

        return (
          <DrawerSection
            key={kind}
            sectionId={kind}
            surface='card'
            title={title}
            defaultOpen={false}
          >
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
                kind === 'artwork' && releaseId ? handleArtworkFile : undefined
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
          </DrawerSection>
        );
      })}
    </div>
  );
}
