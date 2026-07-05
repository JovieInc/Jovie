'use client';

import { Upload } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo } from 'react';

import type { PendingFile } from '../hooks/useChatFileAttachments';

const ACCENT = '#7170ff';

function tint(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

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
  const accent = ACCENT;
  const tinted = useMemo(() => tint(accent, 0.16), [accent]);

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

  return (
    <AnimatePresence>
      {isDragOver ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className='system-b-chat-drop-zone-overlay'
          aria-hidden='false'
          role='presentation'
        >
          <div className='system-b-chat-drop-zone-border' />
          <div className='system-b-chat-drop-zone-content'>
            <span
              className='system-b-chat-drop-zone-icon'
              style={{ background: tinted }}
            >
              <Upload
                className='h-7 w-7'
                style={{ color: accent }}
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
            <div className='system-b-chat-drop-zone-badges'>
              {Array.from(kindCounts.entries()).map(([kind, count]) => (
                <span key={kind} className='system-b-chat-drop-zone-badge'>
                  {count} {KIND_LABELS[kind] ?? kind}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
