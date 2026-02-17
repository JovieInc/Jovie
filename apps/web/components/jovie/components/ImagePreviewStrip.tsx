'use client';

import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';

import { cn } from '@/lib/utils';

import type { PendingImage } from '../hooks/useChatImageAttachments';

interface ImagePreviewStripProps {
  readonly images: PendingImage[];
  readonly onRemove: (id: string) => void;
}

export function ImagePreviewStrip({
  images,
  onRemove,
}: ImagePreviewStripProps) {
  if (images.length === 0) return null;

  return (
    <div className='flex gap-2 px-3 pt-2'>
      <AnimatePresence mode='popLayout'>
        {images.map(image => (
          <motion.div
            key={image.id}
            className='group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-surface-2'
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
          >
            <Image
              src={image.previewUrl}
              alt={image.name}
              fill
              className='object-cover'
              unoptimized
            />
            <button
              type='button'
              onClick={() => onRemove(image.id)}
              className={cn(
                'absolute right-1 top-1 flex h-5 w-5 items-center justify-center',
                'rounded-full bg-black/60 opacity-0 group-hover:opacity-100',
                'text-white transition-opacity',
                'focus-visible:opacity-100'
              )}
              aria-label={`Remove ${image.name}`}
            >
              <X className='h-3 w-3' />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
