'use client';

import { useRouter } from 'next/navigation';
import {
  DashboardRefreshButton as DashboardRefreshButtonMolecule,
  type DashboardRefreshButtonProps as DashboardRefreshButtonMoleculeProps,
} from '@/components/dashboard/molecules/DashboardRefreshButton';

/**
 * @deprecated This component is a wrapper that adds business logic (router refresh).
 * For new code, use the molecule version directly and handle refresh in the parent component.
 * This wrapper exists for backward compatibility.
 */
export type DashboardRefreshButtonProps = Omit<
  DashboardRefreshButtonMoleculeProps,
  'onRefresh'
>;

export function DashboardRefreshButton(props: DashboardRefreshButtonProps) {
  const router = useRouter();

  return (
    <DashboardRefreshButtonMolecule
      {...props}
      onRefresh={() => {
        router.refresh();
      }}
    />
  );
}

DashboardRefreshButton.displayName = 'DashboardRefreshButton';
