'use client';

import { Download, ShieldBan } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AudienceQuickActionsCellProps {
  readonly onExport: () => void;
  readonly onBlock: () => void;
  readonly className?: string;
}

export function AudienceQuickActionsCell({
  onExport,
  onBlock,
  className,
}: AudienceQuickActionsCellProps) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: stopPropagation prevents row click when using action buttons
    <div
      role='toolbar'
      className={cn(
        'flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100',
        className
      )}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      <button
        type='button'
        onClick={onExport}
        className='inline-flex h-7 w-7 items-center justify-center rounded-md text-tertiary-token transition-colors hover:bg-interactive-hover hover:text-secondary-token focus-visible:outline-none focus-visible:bg-interactive-hover'
        aria-label='Export contact'
        title='Export vCard'
      >
        <Download className='h-4 w-4' />
      </button>
      <button
        type='button'
        onClick={onBlock}
        className='inline-flex h-7 w-7 items-center justify-center rounded-md text-tertiary-token transition-colors hover:bg-interactive-hover hover:text-error focus-visible:outline-none focus-visible:bg-interactive-hover'
        aria-label='Block member'
        title='Block'
      >
        <ShieldBan className='h-4 w-4' />
      </button>
    </div>
  );
}
