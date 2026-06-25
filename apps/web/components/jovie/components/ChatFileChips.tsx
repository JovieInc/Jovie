'use client';

import {
  Check,
  FileArchive,
  FileAudio2,
  FileImage,
  FileText,
  FileVideo,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { PendingFile } from '../hooks/useChatFileAttachments';

function kindIcon(kind: PendingFile['kind']) {
  switch (kind) {
    case 'audio':
      return <FileAudio2 className='h-3 w-3' />;
    case 'video':
      return <FileVideo className='h-3 w-3' />;
    case 'image':
      return <FileImage className='h-3 w-3' />;
    case 'archive':
      return <FileArchive className='h-3 w-3' />;
    case 'document':
      return <FileText className='h-3 w-3' />;
    default:
      return <FileText className='h-3 w-3' />;
  }
}

interface ChatFileChipsProps {
  readonly files: PendingFile[];
  readonly onRemove: (id: string) => void;
}

export function ChatFileChips({ files, onRemove }: ChatFileChipsProps) {
  const ready = files.filter(f => f.status === 'ready');
  if (ready.length === 0) return null;

  return (
    <div className='flex flex-wrap gap-2'>
      <AnimatePresence mode='popLayout'>
        {ready.map(f => (
          <motion.span
            key={f.id}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            className='system-b-chat-file-chip'
          >
            <span className='system-b-chat-file-chip-icon'>
              {f.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={f.previewUrl}
                  alt={f.name}
                  className='h-full w-full object-cover'
                />
              ) : (
                kindIcon(f.kind)
              )}
            </span>
            <span className='max-w-[120px] truncate text-xs text-secondary-token'>
              {f.name}
            </span>
            <Check
              className='h-3 w-3 shrink-0 text-[oklch(72%_0.19_149)]'
              strokeWidth={2.5}
            />
            <button
              type='button'
              onClick={() => onRemove(f.id)}
              className='ml-0.5 flex h-4 w-4 items-center justify-center rounded-full hover:bg-surface-2'
              aria-label={`Remove ${f.name}`}
            >
              <X className='h-3 w-3 text-tertiary-token' />
            </button>
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
