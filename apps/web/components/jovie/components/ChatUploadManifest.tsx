'use client';

import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  FileArchive,
  FileAudio2,
  FileImage,
  FileText,
  FileVideo,
  Loader2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { PendingFile } from '../hooks/useChatFileAttachments';

const _ACCENT = '#7170ff';

function _formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function kindIcon(kind: PendingFile['kind']) {
  switch (kind) {
    case 'audio':
      return <FileAudio2 className='h-3.5 w-3.5' />;
    case 'video':
      return <FileVideo className='h-3.5 w-3.5' />;
    case 'image':
      return <FileImage className='h-3.5 w-3.5' />;
    case 'archive':
      return <FileArchive className='h-3.5 w-3.5' />;
    case 'document':
      return <FileText className='h-3.5 w-3.5' />;
    default:
      return <FileText className='h-3.5 w-3.5' />;
  }
}

function statusColor(status: PendingFile['status']): string {
  switch (status) {
    case 'ready':
      return 'text-[oklch(72%_0.19_149)]';
    case 'error':
      return 'text-error';
    case 'duplicate':
      return 'text-warning';
    case 'uploading':
      return 'text-primary-token';
    default:
      return 'text-tertiary-token';
  }
}

function statusText(f: PendingFile): string {
  switch (f.status) {
    case 'ready':
      return 'Uploaded';
    case 'error':
      return f.error ?? 'Failed';
    case 'duplicate':
      return 'Duplicate — skipped';
    case 'uploading':
      return `${f.progress}% · uploading`;
    case 'queued':
      return 'Queued';
    default:
      return f.kindLabel;
  }
}

interface ChatUploadManifestProps {
  readonly files: PendingFile[];
  readonly aggregate: {
    readonly total: number;
    readonly done: number;
    readonly overallPct: number;
    readonly speed: string;
    readonly eta: string;
  };
  readonly isUploading: boolean;
  readonly onRemove: (id: string) => void;
  readonly onCollapse?: () => void;
  /** When true, show the collapsed variant (just a summary bar + thumbnails). */
  readonly collapsed?: boolean;
  /** When collapsed, allow expanding. */
  readonly onExpand?: () => void;
}

export function ChatUploadManifest({
  files,
  aggregate,
  isUploading,
  onRemove,
  collapsed = false,
  onExpand,
  onCollapse,
}: ChatUploadManifestProps) {
  const visibleFiles = files.filter(f => f.status !== 'duplicate');

  if (files.length === 0) return null;

  if (collapsed) {
    return (
      <div className='system-b-chat-upload-manifest system-b-chat-upload-manifest-collapsed'>
        <button
          type='button'
          onClick={onExpand}
          className='flex w-full items-center gap-3 px-3 py-2.5'
        >
          <span className='flex h-5 w-5 items-center justify-center'>
            <Loader2 className='h-4 w-4 animate-spin text-primary-token' />
          </span>
          <div className='min-w-0 flex-1 text-left'>
            <p className='text-xs font-medium text-primary-token'>
              Uploading {aggregate.total} attachments
            </p>
            <p className='text-xs text-tertiary-token'>
              {aggregate.done} done · {aggregate.speed} · {aggregate.eta}
            </p>
          </div>
          <span className='text-xs font-medium tabular-nums text-primary-token'>
            {aggregate.overallPct}%
          </span>
          <ChevronDown className='h-3.5 w-3.5 text-tertiary-token' />
        </button>
        <div className='system-b-chat-upload-manifest-bar'>
          <div
            className='system-b-chat-upload-manifest-bar-fill'
            style={{ width: `${aggregate.overallPct}%` }}
          />
        </div>
        <div className='flex gap-1.5 px-3 py-2.5'>
          {files.map(f => (
            <span key={f.id} className='system-b-chat-upload-manifest-thumb'>
              {f.status === 'ready' ? (
                <span className='system-b-chat-upload-manifest-thumb-done'>
                  <Check className='h-3.5 w-3.5 text-[oklch(72%_0.19_149)]' />
                </span>
              ) : (
                <span className='opacity-50'>{kindIcon(f.kind)}</span>
              )}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className='system-b-chat-upload-manifest'>
      {/* Header */}
      <div className='flex items-center gap-3 px-3.5 py-3'>
        <span className='flex h-6 w-6 items-center justify-center rounded-lg bg-[oklch(60%_0.27_277/16%)]'>
          {isUploading ? (
            <Loader2 className='h-3.5 w-3.5 animate-spin text-[oklch(60%_0.27_277)]' />
          ) : (
            <Check className='h-3.5 w-3.5 text-[oklch(72%_0.19_149)]' />
          )}
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-xs font-medium text-primary-token'>
            {isUploading
              ? `Uploading ${aggregate.total} files`
              : `Upload complete`}
          </p>
          <p className='text-xs text-tertiary-token'>
            {aggregate.done} done · {aggregate.speed} · {aggregate.eta}
          </p>
        </div>
        <span className='text-xs font-semibold tabular-nums text-primary-token'>
          {aggregate.overallPct}%
        </span>
        {onCollapse ? (
          <button
            type='button'
            onClick={onCollapse}
            className='flex h-5 w-5 items-center justify-center rounded-md hover:bg-surface-2'
            aria-label='Collapse Upload Manifest'
          >
            <ChevronDown className='h-3.5 w-3.5 rotate-180 text-tertiary-token' />
          </button>
        ) : null}
      </div>

      {/* Overall progress bar */}
      <div className='system-b-chat-upload-manifest-bar'>
        <div
          className='system-b-chat-upload-manifest-bar-fill'
          style={{ width: `${aggregate.overallPct}%` }}
        />
      </div>

      {/* File list */}
      <div className='system-b-chat-upload-manifest-list'>
        <AnimatePresence mode='popLayout'>
          {visibleFiles.map(f => (
            <motion.div
              key={f.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className='system-b-chat-upload-manifest-row'
            >
              <span className='system-b-chat-upload-manifest-thumb'>
                {f.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={f.previewUrl}
                    alt={f.name}
                    className='h-full w-full object-cover'
                  />
                ) : (
                  <span className='text-secondary-token'>
                    {kindIcon(f.kind)}
                  </span>
                )}
              </span>
              <div className='min-w-0 flex-1'>
                <p className='truncate text-xs text-primary-token'>{f.name}</p>
                <p className={`text-xs ${statusColor(f.status)}`}>
                  {statusText(f)}
                </p>
              </div>
              {f.status === 'ready' ? (
                <Check
                  className='h-3.5 w-3.5 shrink-0 text-[oklch(72%_0.19_149)]'
                  strokeWidth={2.5}
                />
              ) : f.status === 'error' ? (
                <AlertCircle className='h-3.5 w-3.5 shrink-0 text-error' />
              ) : f.status === 'duplicate' ? (
                <Copy className='h-3.5 w-3.5 shrink-0 text-warning' />
              ) : f.status !== 'queued' ? (
                <div className='system-b-chat-upload-manifest-mini-bar'>
                  <div
                    className='system-b-chat-upload-manifest-mini-bar-fill'
                    style={{ width: `${f.progress}%` }}
                  />
                </div>
              ) : null}
            </motion.div>
          ))}
        </AnimatePresence>
        {/* Duplicate summary */}
        {files.filter(f => f.status === 'duplicate').length > 0 ? (
          <div className='flex items-center gap-2 px-2 py-1.5 text-xs text-warning'>
            <Copy className='h-3 w-3' />
            {files.filter(f => f.status === 'duplicate').length} duplicate
            {files.filter(f => f.status === 'duplicate').length > 1 ? 's' : ''}{' '}
            skipped
          </div>
        ) : null}
      </div>
    </div>
  );
}
