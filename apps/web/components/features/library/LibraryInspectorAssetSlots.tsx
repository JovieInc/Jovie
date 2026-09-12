'use client';

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
import {
  type LibraryInspectorAssetKind,
  projectLibraryInspectorAssetSlot,
} from '@/lib/library/stateful-asset-slot';
import { StatefulAssetSlot } from './StatefulAssetSlot';

const IMAGE_ACCEPT = SUPPORTED_IMAGE_MIME_TYPES.join(',');
const SLOT_SECTIONS: readonly {
  readonly kind: Exclude<LibraryInspectorAssetKind, 'audio'>;
  readonly title: string;
  readonly acquireLabel: string;
  readonly acquireHint: string;
}[] = [
  {
    kind: 'artwork',
    title: 'Artwork',
    acquireLabel: 'Drop artwork',
    acquireHint: 'JPEG, PNG, WebP, or AVIF.',
  },
  {
    kind: 'video',
    title: 'Video',
    acquireLabel: 'Add video',
    acquireHint: 'Connect a video to this object.',
  },
  {
    kind: 'docs',
    title: 'Documents',
    acquireLabel: 'Add document',
    acquireHint: 'Ideas, scripts, and one-sheets.',
  },
  {
    kind: 'stems',
    title: 'Stems',
    acquireLabel: 'Add stems',
    acquireHint: 'Promo downloads and stem packs.',
  },
];

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
      {SLOT_SECTIONS.map(section => {
        const slot = projectLibraryInspectorAssetSlot(
          section.kind,
          { ...asset, artworkUrl },
          stems.length
        );
        const acquireHref =
          section.kind === 'video'
            ? buildLibraryViewRoute('videos')
            : section.kind === 'docs'
              ? buildLibraryViewRoute('documents')
              : stemsHref;

        return (
          <DrawerSection
            key={section.kind}
            sectionId={section.kind}
            surface='card'
            title={section.title}
            defaultOpen={false}
          >
            <StatefulAssetSlot
              kind={section.kind}
              occupancy={slot.occupancy}
              cardinality={slot.cardinality}
              acquireMode={slot.acquireMode}
              testIdPrefix={`library-${section.kind}`}
              objectTitle={slot.objectTitle}
              objectSubtitle={slot.objectSubtitle}
              previewSrc={section.kind === 'artwork' ? artworkUrl : undefined}
              accept={section.kind === 'artwork' ? IMAGE_ACCEPT : undefined}
              disabled={disabled || (section.kind === 'artwork' && !releaseId)}
              acquireLabel={section.acquireLabel}
              acquireHint={section.acquireHint}
              acquireHref={section.kind === 'artwork' ? undefined : acquireHref}
              onFile={
                section.kind === 'artwork' && releaseId
                  ? handleArtworkFile
                  : undefined
              }
              addHref={section.kind === 'stems' ? stemsHref : undefined}
            >
              {section.kind === 'stems'
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
