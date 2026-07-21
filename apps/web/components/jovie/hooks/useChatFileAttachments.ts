'use client';

import { upload } from '@vercel/blob/client';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AUDIO_FILE_ACCEPT,
  AUDIO_MAX_FILE_SIZE_BYTES,
  canonicalizeAudioFileForUpload,
  getCanonicalAudioMimeType,
  isSupportedAudioFile,
} from '@/lib/audio/constants';
import {
  convertHeicToJpeg,
  isHeicLikeMimeType,
} from '@/lib/images/heic-conversion';
import type { FileUIPart } from '../types';

// ── Constants ──────────────────────────────────────────────────────────

/** Maximum number of files per chat message. */
const MAX_FILES_PER_MESSAGE = 20;

/** Maximum file size for non-audio files (500 MB — covers large video masters). */
const CHAT_FILE_MAX_SIZE = 500 * 1024 * 1024;

/** Maximum total batch size (5 GB). */
const CHAT_BATCH_MAX_SIZE = 5 * 1024 * 1024 * 1024;

/** Accepted MIME types for the file input. */
const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/gif',
  'image/tiff',
  AUDIO_FILE_ACCEPT,
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'application/zip',
  'application/x-zip-compressed',
  'application/pdf',
  'text/plain',
].join(',');

// ── Types ──────────────────────────────────────────────────────────────

export type FileKind =
  | 'image'
  | 'audio'
  | 'video'
  | 'archive'
  | 'document'
  | 'other';

export type FileUploadStatus =
  | 'queued'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'error'
  | 'duplicate'
  | 'locked';

export interface PendingFile {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly mediaType: string;
  readonly kind: FileKind;
  readonly progress: number;
  readonly speed: number;
  readonly status: FileUploadStatus;
  readonly error?: string;
  readonly previewUrl?: string;
  readonly dataUrl?: string;
  readonly blobUrl?: string;
  readonly fromZip?: boolean;
  readonly hashPrefix?: string;
  readonly kindLabel: string;
  readonly aspect?: string;
  readonly duplicateOf?: string;
}

interface UseChatFileAttachmentsOptions {
  /** Max files per batch from the user's plan. Null = unlimited. */
  readonly fileUploadLimit?: number | null;
  readonly onError: (message: string) => void;
  readonly onAudioUploaded?: (result: {
    readonly fileName: string;
    readonly previewUrl: string;
    readonly releaseId: string;
    readonly releaseTitle: string;
    readonly inference: import('@/lib/chat/infer-audio-entity').AudioEntityInference;
    readonly prompt: string;
  }) => void;
  readonly disabled?: boolean;
}

export interface UseChatFileAttachmentsReturn {
  readonly pendingFiles: PendingFile[];
  readonly isDragOver: boolean;
  readonly isUploading: boolean;
  readonly hasReadyFiles: boolean;
  readonly addFiles: (files: FileList | File[]) => void;
  readonly removeFile: (id: string) => void;
  readonly clearFiles: () => void;
  readonly toFileUIParts: () => FileUIPart[];
  readonly dropZoneRef: React.RefObject<HTMLDivElement | null>;
  readonly accept: string;
  readonly aggregate: {
    readonly total: number;
    readonly done: number;
    readonly uploading: number;
    readonly queued: number;
    readonly errors: number;
    readonly duplicates: number;
    readonly locked: number;
    readonly totalBytes: number;
    readonly uploadedBytes: number;
    readonly overallPct: number;
    readonly speed: string;
    readonly eta: string;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}

function detectKind(file: File): FileKind {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/') || isSupportedAudioFile(file))
    return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  if (
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed'
  )
    return 'archive';
  if (file.type === 'application/pdf' || file.type === 'text/plain')
    return 'document';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (['wav', 'aiff', 'flac', 'mp3', 'aac', 'm4a'].includes(ext))
    return 'audio';
  if (['mp4', 'mov', 'webm', 'avi'].includes(ext)) return 'video';
  if (
    ['png', 'jpg', 'jpeg', 'webp', 'avif', 'heic', 'gif', 'tiff'].includes(ext)
  )
    return 'image';
  if (ext === 'zip') return 'archive';
  if (ext === 'pdf') return 'document';
  return 'other';
}

function buildKindLabel(file: File, kind: FileKind): string {
  const ext = file.name.split('.').pop()?.toUpperCase() ?? '';
  switch (kind) {
    case 'audio':
      return ext ? `${ext} · audio` : 'Audio';
    case 'video':
      return ext ? `${ext} · video` : 'Video';
    case 'image':
      return ext ? `${ext} · image` : 'Image';
    case 'archive':
      return 'ZIP · archive';
    case 'document':
      return ext ? `${ext} · document` : 'Document';
    default:
      return ext || 'File';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '—';
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatEta(seconds: number): string {
  if (seconds <= 0 || !Number.isFinite(seconds)) return '—';
  if (seconds < 60)
    return `ETA 0:${String(Math.round(seconds)).padStart(2, '0')}`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `ETA ${mins}:${String(secs).padStart(2, '0')}`;
}

async function quickHash(file: File): Promise<string> {
  const chunkSize = 64 * 1024;
  const head = file.slice(0, chunkSize);
  const tail = file.slice(Math.max(0, file.size - chunkSize));
  const headBuf = await head.arrayBuffer();
  const tailBuf = await tail.arrayBuffer();
  const hashBuf = new Uint8Array(headBuf.byteLength + tailBuf.byteLength + 8);
  hashBuf.set(new Uint8Array(headBuf), 0);
  hashBuf.set(new Uint8Array(tailBuf), headBuf.byteLength);
  const dv = new DataView(
    hashBuf.buffer,
    headBuf.byteLength + tailBuf.byteLength,
    8
  );
  dv.setFloat64(0, file.size, true);
  let h = 0x811c9dc5;
  for (const byte of hashBuf) {
    h ^= byte;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function shouldSkipZipEntry(name: string): boolean {
  return (
    name.startsWith('__MACOSX/') || name.startsWith('.') || name.includes('/.')
  );
}

function guessMimeFromExtension(ext: string): string {
  const audioMimeType = getCanonicalAudioMimeType(`file.${ext}`);
  if (audioMimeType) return audioMimeType;
  if (['mp4', 'mov', 'webm', 'avi'].includes(ext)) {
    return `video/${ext === 'mov' ? 'quicktime' : ext}`;
  }
  if (['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'tiff'].includes(ext)) {
    return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  }
  if (ext === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

function isZipFile(file: File): boolean {
  return (
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed'
  );
}

async function expandZip(file: File): Promise<File[]> {
  try {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(file);
    const entries: File[] = [];
    for (const name of Object.keys(zip.files)) {
      const entry = zip.files[name];
      if (entry.dir || shouldSkipZipEntry(name)) continue;
      const blob = await entry.async('blob');
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      const mime = guessMimeFromExtension(ext);
      entries.push(
        new File([blob], name.split('/').pop() ?? name, { type: mime })
      );
    }
    return entries;
  } catch {
    return [];
  }
}

function formatAggregateSpeed(
  totalSpeed: number,
  isUploading: boolean
): string {
  if (totalSpeed > 0) return formatSpeed(totalSpeed);
  if (isUploading) return 'connecting…';
  return '—';
}

function formatAggregateEta(
  etaSeconds: number,
  isUploading: boolean,
  done: number,
  total: number
): string {
  if (isUploading) return formatEta(etaSeconds);
  if (done === total && total > 0) return 'Complete';
  return '—';
}

type UploadFileUpdater = (id: string, patch: Partial<PendingFile>) => void;

async function uploadImageAttachment(
  file: File,
  id: string,
  updateFile: UploadFileUpdater
): Promise<void> {
  updateFile(id, { status: 'uploading', progress: 0 });
  let previewUrl: string | undefined;
  try {
    let processedFile = file;
    if (isHeicLikeMimeType(file.type)) {
      try {
        processedFile = await convertHeicToJpeg(file);
      } catch {
        updateFile(id, {
          status: 'error',
          error: 'Could not process HEIC. Try JPEG or PNG.',
        });
        return;
      }
    }

    previewUrl = URL.createObjectURL(processedFile);
    const blob = await upload(processedFile.name, processedFile, {
      access: 'public',
      handleUploadUrl: '/api/chat/files/upload-token',
    });
    updateFile(id, {
      status: 'ready',
      progress: 100,
      blobUrl: blob.url,
      previewUrl,
      mediaType: processedFile.type,
    });
  } catch (err) {
    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    updateFile(id, {
      status: 'error',
      error:
        err instanceof Error ? err.message : `Failed to upload ${file.name}.`,
    });
  }
}

async function uploadAudioAttachment(
  file: File,
  id: string,
  updateFile: UploadFileUpdater,
  onAudioUploaded?: UseChatFileAttachmentsOptions['onAudioUploaded']
): Promise<void> {
  updateFile(id, { status: 'uploading', progress: 0 });
  try {
    const uploadFile = canonicalizeAudioFileForUpload(file);
    const blob = await upload(uploadFile.name, uploadFile, {
      access: 'public',
      handleUploadUrl: '/api/library/audio/upload-token',
    });
    const response = await fetch('/api/chat/audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blobUrl: blob.url,
        blobPathname: blob.pathname,
        fileName: uploadFile.name,
        fileMimeType: uploadFile.type,
        fileSizeBytes: uploadFile.size,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      readonly previewUrl?: string;
      readonly releaseId?: string;
      readonly releaseTitle?: string;
      readonly prompt?: string;
      readonly inference?: import('@/lib/chat/infer-audio-entity').AudioEntityInference;
      readonly error?: string;
    };
    if (!response.ok || !body.previewUrl || !body.prompt || !body.inference) {
      throw new Error(body.error ?? 'Audio upload failed');
    }
    onAudioUploaded?.({
      fileName: file.name,
      previewUrl: body.previewUrl,
      releaseId: body.releaseId ?? '',
      releaseTitle: body.releaseTitle ?? '',
      inference: body.inference,
      prompt: body.prompt,
    });
    updateFile(id, {
      status: 'ready',
      progress: 100,
      blobUrl: blob.url,
      previewUrl: body.previewUrl,
    });
  } catch (err) {
    updateFile(id, {
      status: 'error',
      error: err instanceof Error ? err.message : 'Upload failed',
    });
  }
}

async function uploadGenericAttachment(
  file: File,
  id: string,
  updateFile: UploadFileUpdater
): Promise<void> {
  updateFile(id, { status: 'uploading', progress: 0 });
  try {
    const blob = await upload(file.name, file, {
      access: 'public',
      handleUploadUrl: '/api/chat/files/upload-token',
    });
    updateFile(id, {
      status: 'ready',
      progress: 100,
      blobUrl: blob.url,
    });
  } catch (err) {
    updateFile(id, {
      status: 'error',
      error: err instanceof Error ? err.message : 'Upload failed',
    });
  }
}

async function expandRawFiles(
  rawFiles: File[],
  onError: (message: string) => void
): Promise<File[]> {
  const expanded: File[] = [];
  for (const file of rawFiles) {
    if (isZipFile(file)) {
      const inner = await expandZip(file);
      if (inner.length === 0) {
        onError(`Could not read ${file.name}. Is it a valid ZIP?`);
        continue;
      }
      expanded.push(...inner);
      continue;
    }
    expanded.push(file);
  }
  return expanded;
}

async function buildPendingCandidate(
  file: File,
  seenHashes: Map<string, string>
): Promise<{ candidate: PendingFile; file: File } | null> {
  const kind = detectKind(file);
  const maxBytes =
    kind === 'audio' ? AUDIO_MAX_FILE_SIZE_BYTES : CHAT_FILE_MAX_SIZE;
  if (file.size > maxBytes) {
    return null;
  }

  let hashPrefix: string | undefined;
  try {
    hashPrefix = await quickHash(file);
  } catch {
    /* skip dedup */
  }

  const id = generateId();
  let status: FileUploadStatus = 'queued';
  let duplicateOf: string | undefined;
  if (hashPrefix && seenHashes.has(hashPrefix)) {
    status = 'duplicate';
    duplicateOf = seenHashes.get(hashPrefix);
  } else if (hashPrefix) {
    seenHashes.set(hashPrefix, id);
  }

  const previewUrl =
    kind === 'image' || kind === 'video'
      ? URL.createObjectURL(file)
      : undefined;

  return {
    file,
    candidate: {
      id,
      name: file.name,
      size: file.size,
      mediaType: file.type || 'application/octet-stream',
      kind,
      progress: 0,
      speed: 0,
      status,
      hashPrefix,
      kindLabel: buildKindLabel(file, kind),
      previewUrl,
      duplicateOf,
    },
  };
}

function markCandidatesForPlanQuota(
  candidates: PendingFile[],
  prev: PendingFile[],
  planLimit: number,
  hardCap: number
): PendingFile[] {
  const totalSlots = Math.max(0, hardCap - prev.length);
  if (totalSlots <= 0) return [];

  const toAddAll = candidates.slice(0, totalSlots);
  const existingUploadable = prev.filter(
    f => f.status !== 'duplicate' && f.status !== 'locked'
  ).length;
  const planSlots = Math.max(0, planLimit - existingUploadable);

  return toAddAll.map((candidate, index) => {
    if (candidate.status === 'duplicate') return candidate;
    if (index >= planSlots) {
      return { ...candidate, status: 'locked' as FileUploadStatus };
    }
    return candidate;
  });
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useChatFileAttachments({
  fileUploadLimit = null,
  onError,
  onAudioUploaded,
  disabled = false,
}: UseChatFileAttachmentsOptions): UseChatFileAttachmentsReturn {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const addFilesRef = useRef<(files: FileList | File[]) => void>(() => {});
  const pendingFilesRef = useRef(pendingFiles);

  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  useEffect(
    () => () => {
      pendingFilesRef.current.forEach(f => {
        if (f.previewUrl?.startsWith('blob:'))
          URL.revokeObjectURL(f.previewUrl);
      });
    },
    []
  );

  const updateFile = useCallback((id: string, patch: Partial<PendingFile>) => {
    setPendingFiles(prev =>
      prev.map(f => (f.id === id ? { ...f, ...patch } : f))
    );
  }, []);

  const uploadSingleFile = useCallback(
    async (file: File, id: string, kind: FileKind) => {
      if (kind === 'image') {
        await uploadImageAttachment(file, id, updateFile);
        return;
      }
      if (kind === 'audio') {
        await uploadAudioAttachment(file, id, updateFile, onAudioUploaded);
        return;
      }
      await uploadGenericAttachment(file, id, updateFile);
    },
    [onAudioUploaded, updateFile]
  );

  const processBatch = useCallback(
    async (rawFiles: File[]) => {
      const expanded = await expandRawFiles(rawFiles, onError);

      const candidates: PendingFile[] = [];
      const seenHashes = new Map<string, string>();
      let batchBytes = 0;
      const fileById = new Map<string, File>();

      for (const file of expanded) {
        if (batchBytes + file.size > CHAT_BATCH_MAX_SIZE) {
          onError(
            `Batch exceeds ${formatBytes(CHAT_BATCH_MAX_SIZE)}. Remaining files skipped.`
          );
          break;
        }

        const built = await buildPendingCandidate(file, seenHashes);
        if (!built) {
          const kind = detectKind(file);
          const maxBytes =
            kind === 'audio' ? AUDIO_MAX_FILE_SIZE_BYTES : CHAT_FILE_MAX_SIZE;
          onError(`${file.name} exceeds ${formatBytes(maxBytes)}. Skipped.`);
          continue;
        }

        fileById.set(built.candidate.id, built.file);
        candidates.push(built.candidate);
        batchBytes += file.size;
      }

      const planLimit = fileUploadLimit ?? MAX_FILES_PER_MESSAGE;
      const hardCap = MAX_FILES_PER_MESSAGE;
      let markedToAdd: PendingFile[] = [];

      setPendingFiles(prev => {
        markedToAdd = markCandidatesForPlanQuota(
          candidates,
          prev,
          planLimit,
          hardCap
        );
        return [...prev, ...markedToAdd];
      });

      const toUpload = markedToAdd.filter(
        c => c.status !== 'duplicate' && c.status !== 'locked'
      );
      if (toUpload.length === 0) return;

      setIsUploading(true);
      const MAX_CONCURRENT = 6;
      const queue = [...toUpload];

      const runNext = async (): Promise<void> => {
        const next = queue.shift();
        if (!next) return;
        const queuedFile = fileById.get(next.id);
        if (queuedFile) {
          await uploadSingleFile(queuedFile, next.id, next.kind);
        }
        if (queue.length > 0) await runNext();
      };

      const workers = Array.from(
        { length: Math.min(MAX_CONCURRENT, toUpload.length) },
        () => runNext()
      );
      await Promise.all(workers);
      setIsUploading(false);
    },
    [onError, uploadSingleFile, fileUploadLimit]
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      if (disabled) return;
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;
      processBatch(fileArray).catch(() => setIsUploading(false));
    },
    [disabled, processBatch]
  );

  useEffect(() => {
    addFilesRef.current = addFiles;
  }, [addFiles]);

  const removeFile = useCallback((id: string) => {
    setPendingFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.previewUrl?.startsWith('blob:'))
        URL.revokeObjectURL(file.previewUrl);
      return prev.filter(f => f.id !== id);
    });
  }, []);

  const clearFiles = useCallback(() => {
    setPendingFiles(prev => {
      prev.forEach(f => {
        if (f.previewUrl?.startsWith('blob:'))
          URL.revokeObjectURL(f.previewUrl);
      });
      return [];
    });
    setIsUploading(false);
  }, []);

  const toFileUIParts = useCallback(
    (): FileUIPart[] =>
      pendingFiles
        .filter(f => f.status === 'ready')
        .map(f => {
          if (f.blobUrl) {
            return {
              type: 'file' as const,
              mediaType: f.mediaType,
              url: f.blobUrl,
            };
          }
          return null;
        })
        .filter((p): p is FileUIPart => p !== null),
    [pendingFiles]
  );

  const aggregate = useCallback(() => {
    const total = pendingFiles.length;
    const done = pendingFiles.filter(f => f.status === 'ready').length;
    const uploading = pendingFiles.filter(f => f.status === 'uploading').length;
    const queued = pendingFiles.filter(f => f.status === 'queued').length;
    const errors = pendingFiles.filter(f => f.status === 'error').length;
    const duplicates = pendingFiles.filter(
      f => f.status === 'duplicate'
    ).length;
    const locked = pendingFiles.filter(f => f.status === 'locked').length;
    const totalBytes = pendingFiles.reduce((s, f) => s + f.size, 0);
    const uploadedBytes = pendingFiles
      .filter(f => f.status === 'ready')
      .reduce((s, f) => s + f.size, 0);
    const overallPct =
      totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
    const remainingBytes = pendingFiles
      .filter(f => f.status === 'uploading' || f.status === 'queued')
      .reduce((s, f) => s + f.size * (1 - f.progress / 100), 0);
    const totalSpeed = pendingFiles
      .filter(f => f.status === 'uploading')
      .reduce((s, f) => s + f.speed, 0);
    const etaSeconds = totalSpeed > 0 ? remainingBytes / totalSpeed : 0;
    return {
      total,
      done,
      uploading,
      queued,
      errors,
      duplicates,
      locked,
      totalBytes,
      uploadedBytes,
      overallPct,
      speed: formatAggregateSpeed(totalSpeed, isUploading),
      eta: formatAggregateEta(etaSeconds, isUploading, done, total),
    };
  }, [pendingFiles, isUploading]);

  useEffect(() => {
    const el = dropZoneRef.current;
    if (!el) return;
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled && (e.dataTransfer?.types.includes('Files') ?? false)) {
        setIsDragOver(true);
      }
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!el.contains(e.relatedTarget as Node)) setIsDragOver(false);
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (disabled) return;
      const { files } = e.dataTransfer ?? {};
      if (files?.length) addFilesRef.current(files);
    };
    el.addEventListener('dragenter', onDragEnter);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);
    return () => {
      el.removeEventListener('dragenter', onDragEnter);
      el.removeEventListener('dragleave', onDragLeave);
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('drop', onDrop);
    };
  }, [disabled]);

  return {
    pendingFiles,
    isDragOver,
    isUploading,
    hasReadyFiles: pendingFiles.some(f => f.status === 'ready'),
    addFiles,
    removeFile,
    clearFiles,
    toFileUIParts,
    dropZoneRef,
    accept: ACCEPTED_TYPES,
    aggregate: aggregate(),
  };
}
