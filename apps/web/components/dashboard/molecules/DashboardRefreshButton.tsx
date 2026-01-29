'use client';

import { RefreshCw } from 'lucide-react';
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
        <RefreshCw
          className={
            // Dashboard icon convention: use tighter 3.5 sizing; align other dashboard icons to match.
            isPending
              ? 'h-3.5 w-3.5 animate-spin motion-reduce:animate-none'
              : 'h-3.5 w-3.5'
          }
        />
      }
      className={className}
    />
  );
}
