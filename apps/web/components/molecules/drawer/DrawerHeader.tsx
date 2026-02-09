'use client';

import { ArrowLeft, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';
import { useIsMobile } from '@/hooks/useMobile';
import { cn } from '@/lib/utils';

export interface DrawerHeaderProps {
  readonly title: string;
  readonly onClose?: () => void;
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
        'flex h-12 items-center px-4 shrink-0 border-b border-subtle',
        isMobile ? 'gap-2' : 'justify-between',
        className
      )}
    >
      {isMobile && onClose && (
        <DashboardHeaderActionButton
          ariaLabel='Go back'
          onClick={onClose}
          icon={<ArrowLeft aria-hidden='true' />}
        />
      )}
      <h2
        className={cn(
          'text-[13px] font-medium text-primary-token',
          isMobile && 'flex-1 text-center truncate'
        )}
      >
        {title}
      </h2>
      <div className='flex items-center gap-1'>
        {actions}
        {!isMobile && onClose && (
          <DashboardHeaderActionButton
            ariaLabel={`Close ${title.toLowerCase()}`}
            onClick={onClose}
            icon={<X aria-hidden='true' />}
          />
        )}
      </div>
    </div>
  );
}
