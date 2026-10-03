'use client';

// @coverage-via apps/web/components/features/library/StatefulAssetSlot.test.tsx
import { Button } from '@jovie/ui';
import {
  ArrowLeft,
  ChevronRight,
  FileAudio2,
  FileText,
  ImageIcon,
  type LucideIcon,
  Plus,
  Video,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  getLibraryItemKind,
  type LibraryReleaseAsset,
} from '@/app/app/(shell)/library/library-data';
import { ReleaseAudioAssetPanel } from '@/components/features/release/ReleaseAudioAssetPanel';
import { toast } from '@/components/feedback';
import { InspectorSection } from '@/components/molecules/inspector';
import {
  buildLibraryViewRoute,
  buildReleaseDownloadsRoute,
} from '@/constants/routes';
import { SUPPORTED_IMAGE_MIME_TYPES } from '@/lib/images/config';
import type { LibraryDownloadView } from '@/lib/library/post-release-types';
import {
  deriveWorkFiles,
  fileNameFromMediaUrl,
  type WorkFileEntry,
  type WorkFileKind,
} from '@/lib/library/work-files';
import { cn } from '@/lib/utils';
import { StatefulAssetSlot } from './StatefulAssetSlot';

const IMAGE_ACCEPT = SUPPORTED_IMAGE_MIME_TYPES.join(',');

const FILE_ICONS: Record<WorkFileKind, LucideIcon> = {
  audio: FileAudio2,
  artwork: ImageIcon,
  video: Video,
  document: FileText,
  download: FileAudio2,
};

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

const ROW_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55';

export interface LibraryFilesPanelProps {
  readonly asset: LibraryReleaseAsset;
  readonly downloads: readonly LibraryDownloadView[];
  readonly disabled?: boolean;
  readonly disabledTabIndex?: number;
  readonly audioPreviewAction?: ReactNode;
  readonly onAudioUploaded?: (assetId: string, previewUrl: string) => void;
  readonly onArtworkUploaded?: (assetId: string, artworkUrl: string) => void;
}

/**
 * Flat, real-file list for the work inspector's Files view. Only files that
 * actually exist render as rows; clicking a row opens a focused detail with a
 * Back path. Missing media types surface as quiet "Add File" entries instead
 * of empty accordions.
 */
export function LibraryFilesPanel({
  asset,
  downloads,
  disabled = false,
  disabledTabIndex,
  audioPreviewAction,
  onAudioUploaded,
  onArtworkUploaded,
}: LibraryFilesPanelProps) {
  const releaseId = releaseIdForAsset(asset);
  const stems = useMemo(() => {
    if (!releaseId) return [];
    return downloads.filter(download => download.releaseId === releaseId);
  }, [downloads, releaseId]);

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [localArtworkUrl, setLocalArtworkUrl] = useState(asset.artworkUrl);
  const artworkUrl = localArtworkUrl ?? asset.artworkUrl;
  const files = useMemo(
    () => deriveWorkFiles({ ...asset, artworkUrl }, stems),
    [asset, artworkUrl, stems]
  );

  useEffect(() => {
    setFocusedId(null);
    setLocalArtworkUrl(asset.artworkUrl);
  }, [asset.id, asset.artworkUrl]);

  const focused =
    focusedId !== null
      ? (files.find(file => file.id === focusedId) ?? null)
      : null;
  const focusedKind: WorkFileKind | null =
    focused?.kind ??
    (focusedId === 'add:audio'
      ? 'audio'
      : focusedId === 'add:artwork'
        ? 'artwork'
        : null);

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

  const stemsHref = releaseId
    ? buildReleaseDownloadsRoute(releaseId)
    : undefined;

  const addEntries: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly href?: string;
    readonly focusId?: string;
  }> = [
    ...(asset.previewUrl
      ? []
      : [{ id: 'add-audio', label: 'Add Audio', focusId: 'add:audio' }]),
    ...(artworkUrl
      ? []
      : [
          {
            id: 'add-artwork',
            label: 'Add Artwork',
            focusId: releaseId ? 'add:artwork' : undefined,
          },
        ]),
    ...(files.some(file => file.kind === 'video')
      ? []
      : [
          {
            id: 'add-video',
            label: 'Add Video',
            href: buildLibraryViewRoute('videos'),
          },
        ]),
    ...(asset.itemKind === 'document'
      ? []
      : [
          {
            id: 'add-document',
            label: 'Add Document',
            href: buildLibraryViewRoute('documents'),
          },
        ]),
    ...(stemsHref
      ? [
          {
            id: 'add-download',
            label: 'Add Stems Or Downloads',
            href: stemsHref,
          },
        ]
      : []),
  ];

  const backButton = (
    <button
      type='button'
      onClick={() => setFocusedId(null)}
      tabIndex={disabledTabIndex}
      className={cn(
        'inline-flex h-11 items-center gap-1.5 rounded-md px-1.5 text-2xs font-medium text-secondary-token transition-colors duration-subtle hover:text-primary-token',
        ROW_FOCUS_CLASS
      )}
      data-testid='library-file-back'
    >
      <ArrowLeft className='h-3.5 w-3.5' aria-hidden='true' />
      Back to files
    </button>
  );

  if (focusedKind) {
    return (
      <div className='space-y-3' data-testid='library-file-detail'>
        <div className='flex items-center justify-between gap-2'>
          {backButton}
          {focusedKind === 'audio' ? audioPreviewAction : null}
        </div>
        {focusedKind === 'audio' ? (
          <ReleaseAudioAssetPanel
            releaseId={asset.id}
            releaseTitle={asset.title}
            previewUrl={asset.previewUrl}
            durationMs={asset.totalDurationMs}
            disabledTabIndex={disabledTabIndex}
            testIdPrefix='library'
            onUploaded={previewUrl => onAudioUploaded?.(asset.id, previewUrl)}
          />
        ) : null}
        {focusedKind === 'artwork' ? (
          <div className='space-y-3'>
            {artworkUrl ? (
              <div className='rounded-lg border border-subtle bg-surface-0 p-2'>
                <Image
                  src={artworkUrl}
                  alt={`Artwork for ${asset.title}`}
                  width={320}
                  height={320}
                  className='max-h-44 w-full rounded-md object-contain'
                  unoptimized
                />
              </div>
            ) : null}
            <StatefulAssetSlot
              kind='artwork'
              occupancy={artworkUrl ? 'populated' : 'empty'}
              cardinality='single'
              acquireMode='file'
              testIdPrefix='library-artwork'
              objectTitle={fileNameFromMediaUrl(artworkUrl) ?? 'Artwork'}
              objectSubtitle='Published artwork'
              previewSrc={artworkUrl}
              accept={IMAGE_ACCEPT}
              disabled={disabled || !releaseId}
              acquireLabel='Drop artwork'
              acquireHint='JPEG, PNG, WebP, or AVIF.'
              onFile={releaseId ? handleArtworkFile : undefined}
            />
          </div>
        ) : null}
        {focusedKind === 'download' && focused ? (
          <FocusedFileLinkCard
            file={focused}
            subtitle='Restricted download'
            href={stemsHref}
            hrefLabel='Manage downloads'
            disabledTabIndex={disabledTabIndex}
          />
        ) : null}
        {focusedKind === 'video' && focused ? (
          <FocusedFileLinkCard
            file={focused}
            subtitle={focused.accessLabel}
            href={buildLibraryViewRoute('videos')}
            hrefLabel='Open videos'
            disabledTabIndex={disabledTabIndex}
          />
        ) : null}
        {focusedKind === 'document' && focused ? (
          <FocusedFileLinkCard
            file={focused}
            subtitle={
              asset.documentStage
                ? asset.documentStage.replaceAll('_', ' ')
                : 'Private document'
            }
            href={buildLibraryViewRoute('documents')}
            hrefLabel='Open documents'
            disabledTabIndex={disabledTabIndex}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div data-testid='library-files-panel' className='space-y-4'>
      <InspectorSection title='Files'>
        {files.length === 0 ? (
          <p className='rounded-lg border border-dashed border-subtle px-3 py-3 text-2xs text-tertiary-token'>
            No files attached yet.
          </p>
        ) : (
          <div className='space-y-0.5' data-testid='library-files-list'>
            {files.map(file => {
              const Icon = FILE_ICONS[file.kind];
              return (
                <div
                  key={file.id}
                  className='group flex items-center gap-1 rounded-md transition-colors duration-subtle hover:bg-surface-1'
                >
                  <button
                    type='button'
                    onClick={() => setFocusedId(file.id)}
                    disabled={disabled}
                    tabIndex={disabledTabIndex}
                    data-testid={`library-file-${file.id}`}
                    className={cn(
                      'flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-2 text-left',
                      ROW_FOCUS_CLASS
                    )}
                  >
                    <span className='grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-1 text-secondary-token'>
                      {file.thumbnailUrl ? (
                        <Image
                          src={file.thumbnailUrl}
                          alt=''
                          width={32}
                          height={32}
                          className='h-8 w-8 object-cover'
                          unoptimized
                        />
                      ) : (
                        <Icon className='h-4 w-4' strokeWidth={2.25} />
                      )}
                    </span>
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-xs font-medium text-primary-token'>
                        {file.name}
                      </span>
                      <span className='mt-0.5 block truncate text-2xs leading-4 text-tertiary-token'>
                        {file.roleLabel} · {file.accessLabel}
                      </span>
                    </span>
                    <ChevronRight
                      className='h-3.5 w-3.5 shrink-0 text-quaternary-token'
                      aria-hidden='true'
                    />
                  </button>
                  {file.kind === 'audio' ? audioPreviewAction : null}
                </div>
              );
            })}
          </div>
        )}
      </InspectorSection>

      {addEntries.length > 0 ? (
        <InspectorSection title='Add File'>
          <div className='space-y-0.5'>
            {addEntries.map(entry =>
              entry.href ? (
                <Link
                  key={entry.id}
                  href={entry.href}
                  data-testid={`library-${entry.id}-acquisition`}
                  data-asset-slot-mode='acquisition'
                  tabIndex={disabledTabIndex ?? (disabled ? -1 : undefined)}
                  className={cn(
                    'group flex min-h-11 items-center gap-2 rounded-md px-2 text-xs text-secondary-token transition-colors duration-subtle hover:bg-surface-1 hover:text-primary-token focus-visible:bg-surface-1',
                    ROW_FOCUS_CLASS
                  )}
                >
                  <Plus
                    className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
                    aria-hidden='true'
                  />
                  <span className='min-w-0 flex-1 truncate'>{entry.label}</span>
                </Link>
              ) : (
                <button
                  key={entry.id}
                  type='button'
                  onClick={() =>
                    entry.focusId ? setFocusedId(entry.focusId) : undefined
                  }
                  disabled={disabled || !entry.focusId}
                  tabIndex={disabledTabIndex}
                  data-testid={`library-${entry.id}-acquisition`}
                  data-asset-slot-mode='acquisition'
                  className={cn(
                    'group flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-xs text-secondary-token transition-colors duration-subtle hover:bg-surface-1 hover:text-primary-token focus-visible:bg-surface-1 disabled:opacity-60',
                    ROW_FOCUS_CLASS
                  )}
                >
                  <Plus
                    className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
                    aria-hidden='true'
                  />
                  <span className='min-w-0 flex-1 truncate text-left'>
                    {entry.label}
                  </span>
                </button>
              )
            )}
          </div>
        </InspectorSection>
      ) : null}
    </div>
  );
}

function FocusedFileLinkCard({
  file,
  subtitle,
  href,
  hrefLabel,
  disabledTabIndex,
}: {
  readonly file: WorkFileEntry;
  readonly subtitle: string;
  readonly href?: string;
  readonly hrefLabel?: string;
  readonly disabledTabIndex?: number;
}) {
  const Icon = FILE_ICONS[file.kind];
  return (
    <div className='rounded-lg border border-subtle bg-surface-0 px-3 py-3'>
      <div className='flex items-center gap-3'>
        <span className='grid h-8 w-8 shrink-0 place-items-center rounded-md bg-surface-1 text-secondary-token'>
          <Icon className='h-4 w-4' strokeWidth={2.25} />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-xs font-medium text-primary-token'>
            {file.name}
          </p>
          <p className='mt-0.5 text-2xs leading-4 text-tertiary-token'>
            {file.roleLabel} · {subtitle}
          </p>
        </div>
      </div>
      {href && hrefLabel ? (
        <Button asChild size='sm' variant='secondary' className='mt-3'>
          <Link href={href} tabIndex={disabledTabIndex}>
            {hrefLabel}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
