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
  Paperclip,
  Video,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import {
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  classifyWorkAttachment,
  deriveWorkFiles,
  fileNameFromMediaUrl,
  type WorkAttachmentKind,
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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

function hasDraggedFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
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
  /** Opens the file picker once (⌘U from anywhere in the inspector). */
  readonly attachRequested?: boolean;
  readonly onAttachRequestHandled?: () => void;
}

/**
 * Populated work files, focused detail and ONE Attach File control. Click,
 * drop, paste or ⌘U all take any file; the kind is detected after hand-off.
 */
export function LibraryFilesPanel({
  asset,
  downloads,
  disabled = false,
  disabledTabIndex,
  audioPreviewAction,
  onAudioUploaded,
  onArtworkUploaded,
  attachRequested = false,
  onAttachRequestHandled,
}: LibraryFilesPanelProps) {
  const releaseId = releaseIdForAsset(asset);
  const stems = useMemo(() => {
    if (!releaseId) return [];
    return downloads.filter(download => download.releaseId === releaseId);
  }, [downloads, releaseId]);

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [localArtwork, setLocalArtwork] = useState({
    assetId: asset.id,
    url: asset.artworkUrl,
  });
  const artworkUrl =
    localArtwork.assetId === asset.id
      ? (localArtwork.url ?? asset.artworkUrl)
      : asset.artworkUrl;
  const files = useMemo(
    () => deriveWorkFiles({ ...asset, artworkUrl }, stems),
    [asset, artworkUrl, stems]
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingAudio, setPendingAudio] = useState<File | null>(null);
  const [uploadingArtwork, setUploadingArtwork] = useState<{
    readonly assetId: string;
    readonly name: string;
  } | null>(null);
  const uploadingArtworkName =
    uploadingArtwork?.assetId === asset.id ? uploadingArtwork.name : null;
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setFocusedId(null);
    setPendingAudio(null);
    setLocalArtwork({ assetId: asset.id, url: asset.artworkUrl });
  }, [asset.id, asset.artworkUrl]);

  const focused = files.find(file => file.id === focusedId) ?? null;
  const focusedKind: WorkFileKind | null =
    focused?.kind ?? (focusedId === 'add:audio' ? 'audio' : null);

  const handleArtworkFile = useCallback(
    (file: File) => {
      if (!releaseId) return;
      setUploadingArtwork({ assetId: asset.id, name: file.name });
      void uploadLibraryArtwork(releaseId, file)
        .then(nextUrl => {
          setLocalArtwork({ assetId: asset.id, url: nextUrl });
          onArtworkUploaded?.(asset.id, nextUrl);
          toast.success('Artwork attached');
        })
        .catch(error => {
          toast.error(
            error instanceof Error ? error.message : 'Artwork upload failed'
          );
        })
        .finally(() => setUploadingArtwork(null));
    },
    [asset.id, onArtworkUploaded, releaseId]
  );

  const stemsHref = releaseId
    ? buildReleaseDownloadsRoute(releaseId)
    : undefined;

  const attachFile = useCallback(
    (file: File) => {
      const kind = classifyWorkAttachment(file);
      if (kind === 'audio') {
        setPendingAudio(file);
        setFocusedId('add:audio');
        return;
      }
      if (kind === 'artwork' && releaseId) {
        handleArtworkFile(file);
        return;
      }
      const route = attachElsewhereRoute(kind, stemsHref);
      toast.info(attachElsewhereMessage(kind, file.name), {
        action: route
          ? {
              label: route.label,
              onClick: () => globalThis.location?.assign(route.href),
            }
          : undefined,
      });
    },
    [handleArtworkFile, releaseId, stemsHref]
  );

  const attachFiles = useCallback(
    (fileList: FileList | readonly File[] | null | undefined) => {
      if (disabled || !fileList) return;
      for (const file of Array.from(fileList)) attachFile(file);
    },
    [attachFile, disabled]
  );

  const openPicker = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  useEffect(() => {
    if (!attachRequested) return;
    openPicker();
    onAttachRequestHandled?.();
  }, [attachRequested, onAttachRequestHandled, openPicker]);

  useEffect(() => {
    if (disabled) return;
    const handlePaste = (event: ClipboardEvent) => {
      const pasted = event.clipboardData?.files;
      if (!pasted?.length || isEditableTarget(event.target)) return;
      event.preventDefault();
      attachFiles(pasted);
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [attachFiles, disabled]);

  const dropHandlers = {
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (disabled || event.defaultPrevented || !hasDraggedFiles(event)) {
        return;
      }
      event.preventDefault();
      setIsDragging(true);
    },
    onDragLeave: (event: DragEvent<HTMLDivElement>) => {
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) return;
      setIsDragging(false);
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      setIsDragging(false);
      // A nested dropzone (audio replace, artwork slot) already handled it.
      if (disabled || event.defaultPrevented || !hasDraggedFiles(event)) {
        return;
      }
      event.preventDefault();
      attachFiles(event.dataTransfer.files);
    },
  };

  const attachInput = (
    <input
      ref={inputRef}
      type='file'
      multiple
      hidden
      aria-label='Attach File'
      data-testid='library-attach-file-input'
      onChange={event => {
        attachFiles(event.target.files);
        event.target.value = '';
      }}
    />
  );

  const dropOverlay = (
    <div
      aria-hidden='true'
      className={cn(
        'pointer-events-none absolute inset-0 grid place-items-center rounded-lg border border-dashed border-default bg-surface-1 text-xs font-medium text-primary-token opacity-0 transition-opacity duration-subtle',
        isDragging && 'opacity-100'
      )}
      data-testid='library-attach-drop-overlay'
      data-active={isDragging ? 'true' : 'false'}
    >
      Drop to attach
    </div>
  );

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
      <div
        className='relative space-y-3'
        data-testid='library-file-detail'
        {...dropHandlers}
      >
        {attachInput}
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
            pendingFile={pendingAudio}
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
        {dropOverlay}
      </div>
    );
  }

  return (
    <div
      data-testid='library-files-panel'
      className='relative'
      {...dropHandlers}
    >
      {attachInput}
      <InspectorSection title='Files'>
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
          {uploadingArtworkName ? (
            <div
              role='status'
              className='flex h-11 items-center gap-3 px-2 text-xs text-tertiary-token'
              data-testid='library-attach-uploading'
            >
              <span className='h-8 w-8 shrink-0 animate-pulse rounded-md bg-surface-1' />
              <span className='min-w-0 flex-1 truncate'>
                Attaching {uploadingArtworkName}…
              </span>
            </div>
          ) : null}
          <button
            type='button'
            onClick={openPicker}
            disabled={disabled}
            tabIndex={disabledTabIndex}
            aria-keyshortcuts='Meta+U'
            data-testid='library-attach-file'
            className={cn(
              'group flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-secondary-token transition-colors duration-subtle hover:bg-surface-1 hover:text-primary-token focus-visible:bg-surface-1 disabled:opacity-60',
              ROW_FOCUS_CLASS
            )}
          >
            <Paperclip
              className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
              aria-hidden='true'
            />
            <span className='min-w-0 flex-1 truncate text-left'>
              Attach File
            </span>
            <span className='shrink-0 text-2xs text-quaternary-token'>
              Drop or paste
            </span>
            <kbd className='shrink-0 text-2xs text-tertiary-token'>⌘U</kbd>
          </button>
        </div>
      </InspectorSection>
      {dropOverlay}
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

const ATTACH_ELSEWHERE_LABELS: Record<
  Exclude<WorkAttachmentKind, 'audio' | 'unknown'>,
  string
> = {
  artwork: 'Artwork attaches to releases.',
  video: 'Videos attach from the Videos view.',
  document: 'Documents attach from the Documents view.',
  download: 'Stems and downloads attach from Downloads.',
};

function attachElsewhereMessage(
  kind: WorkAttachmentKind,
  fileName: string
): string {
  if (kind === 'audio' || kind === 'unknown') {
    return `Jovie can't attach ${fileName} yet.`;
  }
  return `${fileName}: ${ATTACH_ELSEWHERE_LABELS[kind]}`;
}

function attachElsewhereRoute(
  kind: WorkAttachmentKind,
  stemsHref: string | undefined
): { readonly label: string; readonly href: string } | null {
  if (kind === 'video') {
    return { label: 'Open Videos', href: buildLibraryViewRoute('videos') };
  }
  if (kind === 'document') {
    return {
      label: 'Open Documents',
      href: buildLibraryViewRoute('documents'),
    };
  }
  if (kind === 'download' && stemsHref) {
    return { label: 'Open Downloads', href: stemsHref };
  }
  return null;
}
