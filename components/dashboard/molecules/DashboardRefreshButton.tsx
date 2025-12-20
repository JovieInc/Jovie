'use client';

import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useTransition } from 'react';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';

export interface DashboardRefreshButtonProps {
  ariaLabel?: string;
  className?: string;
  onRefresh?: () => void | Promise<void>;
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
    // Trigger refresh inside transition to mark any immediate state updates as non-urgent
    startTransition(() => {
      const refreshResult = onRefresh?.();

      if (refreshResult instanceof Promise) {
        // For async refresh: wait for completion before calling onRefreshed
        // Note: onRefreshed will be called outside transition context after promise resolves
        void refreshResult
          .then(() => {
            onRefreshed?.();
          })
          .catch(() => {
            // Still call onRefreshed even if refresh fails
            // Consumer can handle errors in their refresh logic
            onRefreshed?.();
          });
      } else {
        // For sync refresh: call onRefreshed immediately within transition
        onRefreshed?.();
      }
    });
  };

  return (
    <DashboardHeaderActionButton
      ariaLabel={ariaLabel}
      disabled={isPending}
      onClick={handleClick}
      icon={
        <ArrowPathIcon
          className={isPending ? 'h-5 w-5 animate-spin' : 'h-5 w-5'}
        />
      }
      className={className}
    />
  );
}
