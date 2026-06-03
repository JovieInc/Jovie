'use client';

import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';

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
    <div className='system-b-image-preview-strip'>
      <div className='mb-3 flex items-center justify-between gap-3'>
        <div>
          <p className='system-b-image-preview-strip-title'>Attachments</p>
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
              className='system-b-image-preview-item'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Image
                src={image.previewUrl}
                alt={image.name}
                fill
                className='object-cover'
                unoptimized
              />
              <div className='system-b-image-preview-caption'>
                <p className='truncate text-2xs font-medium text-white'>
                  {image.name}
                </p>
              </div>
              <button
                type='button'
                onClick={() => onRemove(image.id)}
                className='system-b-image-preview-remove-button'
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
