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
        className='inline-flex h-6 w-6 items-center justify-center rounded-md text-tertiary-token transition-colors hover:bg-surface-2 hover:text-secondary-token'
        aria-label='Export contact'
        title='Export vCard'
      >
        <Download className='h-3.5 w-3.5' />
      </button>
      <button
        type='button'
        onClick={onBlock}
        className='inline-flex h-6 w-6 items-center justify-center rounded-md text-tertiary-token transition-colors hover:bg-error/10 hover:text-error'
        aria-label='Block member'
        title='Block'
      >
        <ShieldBan className='h-3.5 w-3.5' />
      </button>
    </div>
  );
}
