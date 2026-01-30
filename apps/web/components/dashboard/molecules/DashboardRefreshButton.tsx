'use client';

import { RefreshCw } from 'lucide-react';
import { useTransition } from 'react';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';

export interface DashboardRefreshButtonProps {
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly onRefresh?: () => void;
  readonly onRefreshed?: () => void;
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
        <RefreshCw
          className={
            isPending
              ? 'h-4 w-4 animate-spin motion-reduce:animate-none'
              : 'h-4 w-4'
          }
        />
      }
      className={className}
    />
  );
}
