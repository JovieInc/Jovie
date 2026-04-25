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
    <div className='rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-0 p-3'>
      <div className='mb-3 flex items-center justify-between gap-3'>
        <div>
          <p className='text-2xs font-medium tracking-[-0.01em] text-secondary-token'>
            Attachments
          </p>
          <p className='text-xs text-tertiary-token'>
            {images.length} image{images.length === 1 ? '' : 's'} ready to send
          </p>
        </div>
      </div>

      <div className='flex gap-2 overflow-x-auto pb-0.5'>
        <AnimatePresence mode='popLayout'>
          {images.map(image => (
            <motion.div
              key={image.id}
              className='group relative h-20 w-20 shrink-0 overflow-hidden rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-1'
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
              <div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-2 pb-2 pt-5'>
                <p className='truncate text-2xs font-medium text-white'>
                  {image.name}
                </p>
              </div>
              <button
                type='button'
                onClick={() => onRemove(image.id)}
                className={cn(
                  'absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center',
                  'rounded-[8px] border border-white/15 bg-black/55 text-white transition-opacity',
                  'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100'
                )}
                aria-label={`Remove ${image.name}`}
              >
                <X className='h-3.5 w-3.5' />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
