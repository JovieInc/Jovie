'use client';

import { Button } from '@jovie/ui';
import { ArrowLeft, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
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
  const isMobile = useBreakpointDown('lg');

  return (
    <div
      className={cn(
        'flex items-center justify-between h-11 px-3 shrink-0 border-b border-[rgba(255,255,255,0.05)]',
        className
      )}
    >
      <p className='text-[13px] font-[510] leading-normal text-tertiary-token truncate'>
        {title}
      </p>
      <div className='flex items-center gap-1'>
        {actions}
        {onClose && (
          <Button
            size='icon'
            variant='ghost'
            onClick={onClose}
            className='h-7 w-7 rounded-md text-quaternary-token transition-colors duration-[0.1s] hover:bg-[rgba(255,255,255,0.05)] hover:text-secondary-token'
            aria-label={isMobile ? 'Go back' : 'Close sidebar'}
          >
            {isMobile ? (
              <ArrowLeft className='h-3 w-3' />
            ) : (
              <X className='h-3 w-3' />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
