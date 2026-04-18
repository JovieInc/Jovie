'use client';

import type { QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import type { ProfileSocialLink } from '@/app/app/(shell)/dashboard/actions/social-links';
import { PageShell } from '@/components/organisms/PageShell';
import { PreviewDataHydrator } from '@/features/dashboard/organisms/PreviewDataHydrator';
import { getCanonicalProfileDSPs } from '@/lib/profile-dsps';
import { queryKeys } from '@/lib/queries';
import type { EarningsResponse } from '@/lib/queries/useEarningsQuery';
import { DemoAuthShell } from './DemoAuthShell';

export interface SettingsDemoHarnessProps {
  readonly children: React.ReactNode;
  readonly dashboardData?: DashboardData;
  readonly initialLinks?: ProfileSocialLink[];
  readonly earningsData?: EarningsResponse;
  readonly shell?: 'none' | 'settings' | 'page';
  readonly testId?: string;
}

export function SettingsDemoHarness({
  children,
  dashboardData,
  initialLinks = [],
  earningsData,
  shell = 'none',
  testId,
}: Readonly<SettingsDemoHarnessProps>) {
  const seedQueryClient = useCallback(
    (client: QueryClient) => {
      if (earningsData) {
        client.setQueryData(queryKeys.earnings.stats(), earningsData);
      }
    },
    [earningsData]
  );

  const connectedDSPs =
    dashboardData?.selectedProfile && initialLinks.length > 0
      ? getCanonicalProfileDSPs(dashboardData.selectedProfile, initialLinks)
      : [];

  let content = children;

  if (shell === 'settings') {
    content = (
      <PageShell
        maxWidth='form'
        frame='none'
        contentPadding='none'
        scroll='page'
        surfaceClassName='pb-10'
        data-testid={testId ?? 'settings-shell-content'}
      >
        <div className='space-y-6'>{children}</div>
      </PageShell>
    );
  } else if (shell === 'page') {
    content = (
      <PageShell maxWidth='wide' contentPadding='compact' data-testid={testId}>
        {children}
      </PageShell>
    );
  }

  return (
    <DemoAuthShell
      dashboardData={dashboardData}
      seedQueryClient={seedQueryClient}
    >
      {dashboardData?.selectedProfile ? (
        <PreviewDataHydrator
          initialLinks={initialLinks}
          connectedDSPs={connectedDSPs}
        />
      ) : null}
      {content}
    </DemoAuthShell>
  );
}
