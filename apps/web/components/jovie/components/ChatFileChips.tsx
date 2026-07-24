'use client';

import { Button } from '@jovie/ui';

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
import { fileKindIcon } from './file-kind-icons';

function _kindIcon(kind: PendingFile['kind']) {
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
                fileKindIcon(f.kind, 'h-3 w-3')
              )}
            </span>
            <span className='max-w-30 truncate text-xs text-secondary-token'>
              {f.name}
            </span>
            <Check
              className='h-3 w-3 shrink-0 text-accent-green'
              strokeWidth={2.5}
            />
            <Button
              type='button'
              variant='ghost'
              size='icon'
              onClick={() => onRemove(f.id)}
              className='ml-0.5 h-4 w-4 rounded-full'
              aria-label={`Remove ${f.name}`}
            >
              <X className='h-3 w-3 text-tertiary-token' />
            </Button>
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
