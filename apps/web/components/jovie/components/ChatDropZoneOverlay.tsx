'use client';

import { Upload } from 'lucide-react';
import { useMemo } from 'react';

import type { PendingFile } from '../hooks/useChatFileAttachments';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const KIND_LABELS: Record<string, string> = {
  audio: 'audio',
  video: 'video',
  image: 'images',
  archive: 'archives',
  document: 'documents',
  other: 'files',
};

interface ChatDropZoneOverlayProps {
  readonly isDragOver: boolean;
  readonly pendingFiles: PendingFile[];
}

export function ChatDropZoneOverlay({
  isDragOver,
  pendingFiles,
}: ChatDropZoneOverlayProps) {
  const kindCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of pendingFiles) {
      counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
    }
    return counts;
  }, [pendingFiles]);

  const totalBytes = useMemo(
    () => pendingFiles.reduce((s, f) => s + f.size, 0),
    [pendingFiles]
  );

  if (!isDragOver) {
    return null;
  }

  return (
    <div
      className='system-b-chat-drop-zone-overlay'
      aria-label='Drop Files To Attach To This Thread'
      aria-live='polite'
      aria-atomic='true'
      role='status'
      data-testid='chat-drop-zone-overlay'
      data-transient-surface='file-drop'
    >
      <div className='system-b-chat-drop-zone-border' />
      <div className='system-b-chat-drop-zone-content'>
        <span className='system-b-chat-drop-zone-icon'>
          <Upload
            className='system-b-chat-drop-zone-upload-icon'
            strokeWidth={1.8}
          />
        </span>
        <div className='system-b-chat-drop-zone-title'>
          Drop to attach to this thread
        </div>
        {pendingFiles.length > 0 ? (
          <div className='system-b-chat-drop-zone-subtitle'>
            {pendingFiles.length} files · {formatBytes(totalBytes)} detected
            {' · '}
            {Array.from(kindCounts.entries())
              .map(([k, n]) => `${n} ${KIND_LABELS[k] ?? k}`)
              .join(', ')}
          </div>
        ) : (
          <div className='system-b-chat-drop-zone-subtitle'>
            Multiple files supported · ZIP auto-expanded
          </div>
        )}
        {kindCounts.size > 0 ? (
          <div className='system-b-chat-drop-zone-badges'>
            {Array.from(kindCounts.entries()).map(([kind, count]) => (
              <span key={kind} className='system-b-chat-drop-zone-badge'>
                {count} {KIND_LABELS[kind] ?? kind}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
