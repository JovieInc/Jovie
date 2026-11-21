'use client';

import { Button } from '@jovie/ui';
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
      <Button
        type='button'
        variant='ghost'
        size='icon-sm'
        onClick={onExport}
        className='rounded-md text-tertiary-token hover:bg-interactive-hover hover:text-secondary-token focus-visible:bg-interactive-hover'
        aria-label='Export Contact'
        title='Export vCard'
      >
        <Download className='h-4 w-4' />
      </Button>
      <Button
        type='button'
        variant='ghost'
        size='icon-sm'
        onClick={onBlock}
        className='rounded-md text-tertiary-token hover:bg-error/10 hover:text-error focus-visible:bg-interactive-hover'
        aria-label='Block Member'
        title='Block'
      >
        <ShieldBan className='h-4 w-4' />
      </Button>
    </div>
  );
}
