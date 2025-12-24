'use client';

import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useTransition } from 'react';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';

export interface DashboardRefreshButtonProps {
  ariaLabel?: string;
  className?: string;
  onRefresh?: () => void;
  onRefreshed?: () => void;
}

export function DashboardRefreshButton({
  ariaLabel = 'Refresh',
  className,
  onRefresh,
  onRefreshed,
}: DashboardRefreshButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(() => {
      onRefresh?.();
      onRefreshed?.();
    });
  };

  return (
    <DashboardHeaderActionButton
      ariaLabel={ariaLabel}
      disabled={isPending}
      onClick={handleClick}
      icon={
        <ArrowPathIcon
          className={
            isPending
              ? 'h-5 w-5 animate-spin motion-reduce:animate-none'
              : 'h-5 w-5'
          }
        />
      }
      className={className}
    />
  );
}
