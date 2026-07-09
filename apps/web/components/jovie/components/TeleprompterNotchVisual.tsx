'use client';

import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

interface TeleprompterNotchVisualProps {
  readonly script: string;
  readonly className?: string;
}

const PHONE_SHELL_STYLE: CSSProperties = {
  backgroundColor: 'color-mix(in oklab, var(--color-accent-blue) 8%, #0a0a0f)',
};

/**
 * Hero visual for the teleprompter showcase — a phone silhouette with a
 * notch-adjacent script preview, inspired by Moody's teleprompter demo.
 */
export function TeleprompterNotchVisual({
  script,
  className,
}: TeleprompterNotchVisualProps) {
  const preview =
    script.length > 120 ? `${script.slice(0, 117).trimEnd()}…` : script;

  return (
    <div
      className={cn(
        'relative mx-auto aspect-[10/16] w-full max-w-55 overflow-hidden rounded-[28px] border border-white/14 shadow-[0_24px_60px_rgba(0,0,0,0.45)]',
        className
      )}
      style={PHONE_SHELL_STYLE}
      data-testid='teleprompter-notch-visual'
    >
      <div
        aria-hidden='true'
        className='absolute left-1/2 top-2 h-5 w-24 -translate-x-1/2 rounded-full bg-black dark:bg-black'
      />
      <div className='absolute inset-x-3 top-10 bottom-4 flex flex-col items-center justify-start px-2 pt-3 text-center'>
        <p className='text-[11px] font-medium leading-snug tracking-[-0.01em] text-white/88 dark:text-white/88'>
          {preview}
        </p>
        <span
          aria-hidden='true'
          className='mt-3 h-1 w-10 rounded-full bg-accent-blue/70'
        />
      </div>
      <span
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(113,112,255,0.18),transparent_55%)]'
      />
    </div>
  );
}
