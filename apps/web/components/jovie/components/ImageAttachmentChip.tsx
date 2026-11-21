'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import { ImageIcon } from 'lucide-react';
import Image from 'next/image';
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { fileDisplayName } from '@/lib/chat/file-display-name';
import { cn } from '@/lib/utils';

const HOVER_OPEN_DELAY_MS = 200;
const HOVER_CLOSE_DELAY_MS = 120;

interface ImageAttachmentChipProps {
  readonly url: string;
  readonly name?: string;
  readonly tone?: 'onLight' | 'onDark';
}

/**
 * Compact chip representation of an image attachment in a chat transcript.
 * Same shape as `EntityChip` so the user bubble's chip row reads as one
 * coherent strip when both entity mentions and images are present.
 *
 * Hover/click reveals a popover with the full-resolution preview
 * (object-contain, max 480px) plus filename caption. A11y mirrors
 * `EntityChipPopover` — keyboard, click, hover, focus all supported.
 */
export function ImageAttachmentChip({
  url,
  name,
  tone = 'onLight',
}: ImageAttachmentChipProps) {
  const [open, setOpen] = useState(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const handlePointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== 'mouse') return;
      clearTimers();
      openTimerRef.current = setTimeout(
        () => setOpen(true),
        HOVER_OPEN_DELAY_MS
      );
    },
    [clearTimers]
  );

  const handlePointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== 'mouse') return;
      clearTimers();
      closeTimerRef.current = setTimeout(
        () => setOpen(false),
        HOVER_CLOSE_DELAY_MS
      );
    },
    [clearTimers]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      clearTimers();
      setOpen(next);
    },
    [clearTimers]
  );

  const derived = fileDisplayName(url, name?.trim() || null);
  const label = derived === 'File' ? 'Image' : derived;

  const chipClass = cn(
    'system-b-image-attachment-chip',
    tone === 'onLight'
      ? 'system-b-image-attachment-chip-light'
      : 'system-b-image-attachment-chip-dark'
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type='button'
          aria-haspopup='dialog'
          aria-expanded={open}
          aria-label={`Image attachment: ${label}`}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          className='system-b-image-attachment-trigger'
          data-testid='image-attachment-chip-trigger'
        >
          <span className={chipClass} data-testid='image-attachment-chip'>
            <Image
              src={url}
              alt=''
              width={16}
              height={16}
              className='system-b-image-attachment-thumb'
              unoptimized
              aria-hidden
            />
            <span className='system-b-image-attachment-label'>{label}</span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className='system-b-image-attachment-popover'
        sideOffset={6}
        align='start'
        testId='image-attachment-popover-content'
        onPointerEnter={clearTimers}
        onPointerLeave={event => {
          if (event.pointerType !== 'mouse') return;
          closeTimerRef.current = setTimeout(
            () => setOpen(false),
            HOVER_CLOSE_DELAY_MS
          );
        }}
      >
        <div className='flex flex-col'>
          <div className='relative flex items-center justify-center bg-surface-1'>
            <Image
              src={url}
              alt={label}
              width={480}
              height={480}
              className='system-b-image-attachment-preview'
              unoptimized
            />
          </div>
          <div className='flex items-center gap-2 border-t border-subtle px-3 py-2'>
            <ImageIcon
              className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
              aria-hidden
            />
            <span className='min-w-0 truncate text-xs text-secondary-token'>
              {label}
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
