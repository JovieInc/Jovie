'use client';

import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

interface TeleprompterNotchVisualProps {
  readonly script: string;
  readonly className?: string;
}

const PHONE_SHELL_STYLE: CSSProperties = {
  backgroundColor:
    'color-mix(in oklab, var(--color-accent-blue) 8%, var(--color-ink-on-media))',
};

const PHONE_GLOW_STYLE: CSSProperties = {
  backgroundImage:
    'radial-gradient(circle at 50% 0%, color-mix(in oklab, var(--color-accent-purple) 18%, transparent), transparent 55%)',
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
        'relative mx-auto aspect-[10/16] w-full max-w-55 overflow-hidden rounded-[28px] border border-on-media/14 shadow-xl',
        className
      )}
      style={PHONE_SHELL_STYLE}
      data-testid='teleprompter-notch-visual'
    >
      <div
        aria-hidden='true'
        className='absolute left-1/2 top-2 h-5 w-24 -translate-x-1/2 rounded-full bg-ink-on-media'
      />
      <div className='absolute inset-x-3 top-10 bottom-4 flex flex-col items-center justify-start px-2 pt-3 text-center'>
        <p className='text-2xs font-medium leading-snug tracking-tight text-on-media/88'>
          {preview}
        </p>
        <span
          aria-hidden='true'
          className='mt-3 h-1 w-10 rounded-full bg-accent-blue/70'
        />
      </div>
      <span
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={PHONE_GLOW_STYLE}
      />
    </div>
  );
}
