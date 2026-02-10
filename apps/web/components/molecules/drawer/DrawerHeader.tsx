'use client';

import { Button } from '@jovie/ui';
import { ArrowLeft, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useIsMobile } from '@/hooks/useMobile';
import { cn } from '@/lib/utils';

export interface DrawerHeaderProps {
  /** Title displayed on the left side of the header */
  readonly title: ReactNode;
  /** Close handler — renders a close button (X on desktop, ArrowLeft on mobile) */
  readonly onClose?: () => void;
  /** Additional actions rendered before the close button */
  readonly actions?: ReactNode;
  readonly className?: string;
}

export function DrawerHeader({
  title,
  onClose,
  actions,
  className,
}: DrawerHeaderProps) {
  const isMobile = useIsMobile();

  return (
    <div
      className={cn(
        'flex items-center justify-between border-b border-subtle px-3 py-2 shrink-0',
        className
      )}
    >
      <p className='text-xs font-medium text-secondary-token truncate'>
        {title}
      </p>
      <div className='flex items-center gap-1'>
        {actions}
        {onClose && (
          <Button
            size='icon'
            variant='ghost'
            onClick={onClose}
            className='h-8 w-8 rounded-md text-tertiary-token transition-colors hover:bg-surface-2 hover:text-primary-token'
            aria-label={isMobile ? 'Go back' : 'Close sidebar'}
          >
            {isMobile ? (
              <ArrowLeft className='h-3.5 w-3.5' />
            ) : (
              <X className='h-3.5 w-3.5' />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
