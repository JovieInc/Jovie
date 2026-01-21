'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';
import { cn } from '@/lib/utils';

export interface DrawerHeaderProps {
  title: string;
  onClose?: () => void;
  actions?: ReactNode;
  className?: string;
}

export function DrawerHeader({
  title,
  onClose,
  actions,
  className,
}: DrawerHeaderProps) {
  return (
    <div
      className={cn(
        'flex h-12 items-center justify-between px-4 shrink-0 border-b border-subtle',
        className
      )}
    >
      <h2 className='text-[13px] font-medium text-primary-token'>{title}</h2>
      <div className='flex items-center gap-1'>
        {actions}
        {onClose && (
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
