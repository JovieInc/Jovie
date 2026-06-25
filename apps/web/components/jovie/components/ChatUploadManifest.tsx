'use client';

import { Button } from '@jovie/ui';

import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  Loader2,
  Lock,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import type { PendingFile } from '../hooks/useChatFileAttachments';
import { fileKindIcon } from './file-kind-icons';

const _ACCENT = '#7170ff';

function _formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function statusColor(status: PendingFile['status']): string {
  switch (status) {
    case 'ready':
      return 'text-accent-green';
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
  /** Files locked behind the pay gate (over plan quota) */
  readonly lockedCount?: number;
  /** Whether the user is Pro (controls whether lock CTA shows) */
  readonly isPro?: boolean;
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
  lockedCount = 0,
  isPro = true,
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
        <Button
          type='button'
          variant='ghost'
          onClick={onExpand}
          className='flex w-full items-center gap-3 px-3 py-2.5 justify-start'
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
        </Button>
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
                  <Check className='h-3.5 w-3.5 text-accent-green' />
                </span>
              ) : (
                <span className='opacity-50'>{fileKindIcon(f.kind)}</span>
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
        <span className='flex h-6 w-6 items-center justify-center rounded-lg bg-accent-purple-subtle'>
          {isUploading ? (
            <Loader2 className='h-3.5 w-3.5 animate-spin text-accent-purple' />
          ) : (
            <Check className='h-3.5 w-3.5 text-accent-green' />
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
          <Button
            type='button'
            variant='ghost'
            size='icon'
            onClick={onCollapse}
            className='h-5 w-5 rounded-md'
            aria-label='Collapse Upload Manifest'
          >
            <ChevronDown className='h-3.5 w-3.5 rotate-180 text-tertiary-token' />
          </Button>
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
                    {fileKindIcon(f.kind)}
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
                  className='h-3.5 w-3.5 shrink-0 text-accent-green'
                  strokeWidth={2.5}
                />
              ) : f.status === 'error' ? (
                <AlertCircle className='h-3.5 w-3.5 shrink-0 text-error' />
              ) : f.status === 'duplicate' ? (
                <Copy className='h-3.5 w-3.5 shrink-0 text-warning' />
              ) : f.status === 'locked' ? (
                <Lock className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
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

        {/* Pay gate: locked files over plan quota */}
        {lockedCount > 0 && !isPro ? (
          <div className='system-b-chat-upload-pay-gate'>
            <div className='flex items-center gap-2 px-3 py-2.5'>
              <Lock className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
              <div className='min-w-0 flex-1'>
                <p className='text-xs font-medium text-primary-token'>
                  {lockedCount} file{lockedCount > 1 ? 's' : ''} locked
                </p>
                <p className='text-xs text-tertiary-token'>
                  Upgrade to Pro for unlimited file uploads
                </p>
              </div>
              <Button
                variant='secondary'
                size='sm'
                asChild
                className='shrink-0'
              >
                <Link href={APP_ROUTES.PRICING}>Upgrade to Pro</Link>
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
