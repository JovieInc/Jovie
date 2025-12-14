'use client';

import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';

export interface DashboardRefreshButtonProps {
  ariaLabel?: string;
  className?: string;
  onRefreshed?: () => void;
}

export function DashboardRefreshButton({
  ariaLabel = 'Refresh',
  className,
  onRefreshed,
}: DashboardRefreshButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <DashboardHeaderActionButton
      ariaLabel={ariaLabel}
      disabled={isPending}
      onClick={() => {
        startTransition(() => {
          router.refresh();
          onRefreshed?.();
        });
      }}
      icon={
        <ArrowPathIcon
          className={isPending ? 'h-5 w-5 animate-spin' : 'h-5 w-5'}
        />
      }
      className={className}
    />
  );
}
