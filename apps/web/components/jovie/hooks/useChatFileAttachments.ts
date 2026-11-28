'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthSafe } from '@/hooks/useJovieAuth';
import { validateAudioUpload } from '@/lib/audio/constants';
import type { AudioEntityInference } from '@/lib/chat/infer-audio-entity';
import {
  CHAT_FILE_ACCEPT,
  CHAT_FILE_BATCH_MAX_SIZE_BYTES,
  CHAT_FILE_MAX_FILES_PER_MESSAGE,
  type ChatFileKind,
  detectChatFileKind,
  getCanonicalMimeTypeByFileName,
  validateChatFileUpload,
} from '@/lib/media/file-policy';
import {
  canTransitionMediaLifecycle,
  isMediaLifecycleState,
  type MediaLifecycleState,
} from '@/lib/media/lifecycle';
import type { FileUIPart } from '../types';
import {
  type AudioUploadResult,
  type UploadFileUpdater,
  uploadAudioAttachment,
  uploadGenericAttachment,
  uploadImageAttachment,
} from './chat-file-uploads';

// ── Constants ──────────────────────────────────────────────────────────
// Kinds, MIME aliases, sizes and Blob paths come from the ONE file policy
// (`@/lib/media/file-policy`); nothing is duplicated here.

const MAX_FILES_PER_MESSAGE = CHAT_FILE_MAX_FILES_PER_MESSAGE;
const CHAT_BATCH_MAX_SIZE = CHAT_FILE_BATCH_MAX_SIZE_BYTES;
const ACCEPTED_TYPES = CHAT_FILE_ACCEPT;

// ── Types ──────────────────────────────────────────────────────────────

export type FileKind = ChatFileKind;

export type FileUploadStatus =
  | 'queued'
  | MediaLifecycleState
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
  readonly inference?: AudioEntityInference;
  readonly releaseId?: string;
  readonly releaseTitle?: string;
  readonly prompt?: string;
}

interface UseChatFileAttachmentsOptions {
  /** Max files per batch from the user's plan. Null = unlimited. */
  readonly fileUploadLimit?: number | null;
  readonly onError: (message: string) => void;
  readonly onAudioUploaded?: (result: AudioUploadResult) => void;
  readonly disabled?: boolean;
  /** Clears staged files and cancels uploads when conversation ownership changes. */
  readonly resetKey?: string | null;
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
  return detectChatFileKind(file);
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
  return (
    getCanonicalMimeTypeByFileName(`file.${ext}`) ?? 'application/octet-stream'
  );
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
): Promise<{ candidate: PendingFile; file: File }> {
  const kind = detectKind(file);
  // Named failing rule + CTA for both audio (audio-contracts) and files (file
  // policy) so nothing is skipped silently (JOV-3688).
  const validation =
    kind === 'audio' ? validateAudioUpload(file) : validateChatFileUpload(file);
  if (!validation.ok) {
    return {
      file,
      candidate: {
        id: generateId(),
        name: file.name,
        size: file.size,
        mediaType: file.type || 'application/octet-stream',
        kind,
        progress: 0,
        speed: 0,
        status: 'failed',
        error: validation.message,
        kindLabel: buildKindLabel(file, kind),
      },
    };
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
  resetKey = null,
}: UseChatFileAttachmentsOptions): UseChatFileAttachmentsReturn {
  const { userId } = useAuthSafe();
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const isUploading = pendingFiles.some(file =>
    ['queued', 'uploading', 'processing'].includes(file.status)
  );
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const addFilesRef = useRef<(files: FileList | File[]) => void>(() => {});
  const pendingFilesRef = useRef(pendingFiles);
  const generationRef = useRef(0);
  const uploadControllersRef = useRef(new Map<string, AbortController>());

  useEffect(
    () => () => {
      generationRef.current += 1;
      for (const controller of uploadControllersRef.current.values()) {
        controller.abort();
      }
      uploadControllersRef.current.clear();
      pendingFilesRef.current.forEach(f => {
        if (f.previewUrl?.startsWith('blob:'))
          URL.revokeObjectURL(f.previewUrl);
      });
    },
    []
  );

  const updateFile = useCallback((id: string, patch: Partial<PendingFile>) => {
    if (!pendingFilesRef.current.some(file => file.id === id)) {
      if (patch.previewUrl?.startsWith('blob:'))
        URL.revokeObjectURL(patch.previewUrl);
      return;
    }
    const next = pendingFilesRef.current.map(file => {
      if (file.id !== id) return file;
      if (
        patch.status &&
        isMediaLifecycleState(file.status) &&
        isMediaLifecycleState(patch.status) &&
        !canTransitionMediaLifecycle(file.status, patch.status)
      ) {
        return file;
      }
      if (
        patch.previewUrl &&
        file.previewUrl?.startsWith('blob:') &&
        patch.previewUrl !== file.previewUrl
      ) {
        URL.revokeObjectURL(file.previewUrl);
      }
      return { ...file, ...patch };
    });
    pendingFilesRef.current = next;
    setPendingFiles(next);
  }, []);

  const uploadSingleFile = useCallback(
    async (file: File, id: string, kind: FileKind, generation: number) => {
      if (generation !== generationRef.current) return;
      if (!pendingFilesRef.current.some(pending => pending.id === id)) return;
      const controller = new AbortController();
      uploadControllersRef.current.set(id, controller);
      const isCurrent = () =>
        generation === generationRef.current &&
        !controller.signal.aborted &&
        pendingFilesRef.current.some(pending => pending.id === id);
      const update: UploadFileUpdater = (fileId, patch) => {
        if (isCurrent()) updateFile(fileId, patch);
        else if (patch.previewUrl?.startsWith('blob:'))
          URL.revokeObjectURL(patch.previewUrl);
      };
      try {
        if (kind === 'image') {
          await uploadImageAttachment(
            file,
            id,
            update,
            userId ?? 'unknown',
            controller.signal
          );
        } else if (kind === 'audio') {
          await uploadAudioAttachment(
            file,
            id,
            update,
            userId ?? 'unknown',
            controller.signal,
            result => {
              if (isCurrent()) onAudioUploaded?.(result);
            }
          );
        } else {
          await uploadGenericAttachment(
            file,
            id,
            update,
            userId ?? 'unknown',
            controller.signal
          );
        }
      } finally {
        uploadControllersRef.current.delete(id);
      }
    },
    [onAudioUploaded, updateFile, userId]
  );

  const processBatch = useCallback(
    async (rawFiles: File[]) => {
      const generation = generationRef.current;
      const reportError = (message: string) => {
        if (generation === generationRef.current) onError(message);
      };
      const expanded = await expandRawFiles(rawFiles, reportError);
      if (generation !== generationRef.current) return;

      const candidates: PendingFile[] = [];
      const seenHashes = new Map<string, string>();
      let batchBytes = 0;
      const fileById = new Map<string, File>();

      for (const file of expanded) {
        if (batchBytes + file.size > CHAT_BATCH_MAX_SIZE) {
          reportError(
            `Batch exceeds ${formatBytes(CHAT_BATCH_MAX_SIZE)}. Remaining files skipped.`
          );
          break;
        }

        const built = await buildPendingCandidate(file, seenHashes);
        if (generation !== generationRef.current) {
          for (const candidate of [...candidates, built.candidate]) {
            if (candidate.previewUrl?.startsWith('blob:'))
              URL.revokeObjectURL(candidate.previewUrl);
          }
          return;
        }
        if (built.candidate.status === 'failed') {
          reportError(
            built.candidate.error ?? `Could not attach ${file.name}.`
          );
        }

        fileById.set(built.candidate.id, built.file);
        candidates.push(built.candidate);
        batchBytes += file.size;
      }

      const planLimit = fileUploadLimit ?? MAX_FILES_PER_MESSAGE;
      const hardCap = MAX_FILES_PER_MESSAGE;
      const markedToAdd = markCandidatesForPlanQuota(
        candidates,
        pendingFilesRef.current,
        planLimit,
        hardCap
      );
      const acceptedIds = new Set(markedToAdd.map(file => file.id));
      for (const candidate of candidates) {
        if (
          !acceptedIds.has(candidate.id) &&
          candidate.previewUrl?.startsWith('blob:')
        )
          URL.revokeObjectURL(candidate.previewUrl);
      }
      pendingFilesRef.current = [...pendingFilesRef.current, ...markedToAdd];
      setPendingFiles(pendingFilesRef.current);

      const toUpload = markedToAdd.filter(
        c =>
          c.status !== 'duplicate' &&
          c.status !== 'locked' &&
          c.status !== 'failed'
      );
      if (toUpload.length === 0) return;

      const MAX_CONCURRENT = 6;
      const queue = [...toUpload];

      const runNext = async (): Promise<void> => {
        const next = queue.shift();
        if (!next || generation !== generationRef.current) return;
        const queuedFile = fileById.get(next.id);
        if (queuedFile) {
          await uploadSingleFile(queuedFile, next.id, next.kind, generation);
        }
        if (queue.length > 0) await runNext();
      };

      const workers = Array.from(
        { length: Math.min(MAX_CONCURRENT, toUpload.length) },
        () => runNext()
      );
      await Promise.all(workers);
    },
    [onError, uploadSingleFile, fileUploadLimit]
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      if (disabled) return;
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;
      const generation = generationRef.current;
      void processBatch(fileArray).catch(() => {
        if (generation === generationRef.current)
          onError('Could not prepare these files. Please try again.');
      });
    },
    [disabled, onError, processBatch]
  );

  useEffect(() => {
    addFilesRef.current = addFiles;
  }, [addFiles]);

  const removeFile = useCallback((id: string) => {
    uploadControllersRef.current.get(id)?.abort();
    uploadControllersRef.current.delete(id);
    const file = pendingFilesRef.current.find(pending => pending.id === id);
    if (file?.previewUrl?.startsWith('blob:'))
      URL.revokeObjectURL(file.previewUrl);
    pendingFilesRef.current = pendingFilesRef.current.filter(
      file => file.id !== id
    );
    setPendingFiles(pendingFilesRef.current);
  }, []);

  const clearFiles = useCallback(() => {
    generationRef.current += 1;
    for (const controller of uploadControllersRef.current.values()) {
      controller.abort();
    }
    uploadControllersRef.current.clear();
    for (const file of pendingFilesRef.current) {
      if (file.previewUrl?.startsWith('blob:'))
        URL.revokeObjectURL(file.previewUrl);
    }
    pendingFilesRef.current = [];
    setPendingFiles([]);
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

  useEffect(() => {
    clearFiles();
    setIsDragOver(false);
  }, [resetKey, clearFiles]);

  const aggregate = useMemo(() => {
    const total = pendingFiles.length;
    const done = pendingFiles.filter(f => f.status === 'ready').length;
    const uploading = pendingFiles.filter(
      f => f.status === 'uploading' || f.status === 'processing'
    ).length;
    const queued = pendingFiles.filter(f => f.status === 'queued').length;
    const errors = pendingFiles.filter(f => f.status === 'failed').length;
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
      .filter(
        f =>
          f.status === 'uploading' ||
          f.status === 'processing' ||
          f.status === 'queued'
      )
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
    const clearDragOver = () => setIsDragOver(false);
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
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (disabled) return;
      const { files } = e.dataTransfer ?? {};
      if (files?.length) addFilesRef.current(files);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDragOver(false);
      }
    };
    el.addEventListener('dragenter', onDragEnter);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('dragend', clearDragOver);
    return () => {
      setIsDragOver(false);
      el.removeEventListener('dragenter', onDragEnter);
      el.removeEventListener('dragleave', onDragLeave);
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('drop', onDrop);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('dragend', clearDragOver);
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
    aggregate,
  };
}
