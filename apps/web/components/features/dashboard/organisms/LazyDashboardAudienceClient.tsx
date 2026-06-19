'use client';

import dynamic from 'next/dynamic';
import { AudienceTableLoadingShell } from '@/features/dashboard/organisms/dashboard-audience-table/AudienceTableLoadingShell';
import type { DashboardAudienceClientProps } from './DashboardAudienceClient';

const DashboardAudienceClient = dynamic(
  () =>
    import('./DashboardAudienceClient').then(mod => ({
      default: mod.DashboardAudienceClient,
    })),
  {
    loading: () => <AudienceTableLoadingShell />,
  }
);

export function LazyDashboardAudienceClient(
  props: Readonly<DashboardAudienceClientProps>
) {
  return <DashboardAudienceClient {...props} />;
}
