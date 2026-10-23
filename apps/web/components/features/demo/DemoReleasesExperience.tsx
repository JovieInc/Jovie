'use client';

import { useSearchParams } from 'next/navigation';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import {
  primaryProviderKeys,
  providerConfig,
} from '@/app/app/(shell)/dashboard/releases/config';
import { ShellReleasesView } from '@/components/features/dashboard/organisms/release-provider-matrix/shell-releases/ShellReleasesView';
import {
  FOUNDER_DEMO_PERSONA,
  INTERNAL_DJ_DEMO_PERSONA,
} from '@/lib/demo-personas';
import { DemoAuthShell } from './DemoAuthShell';
import { createDemoReleaseExperienceAdapter } from './demo-release-experience-adapter';
import { FOUNDER_DEMO_DASHBOARD_DATA } from './mock-dashboard-data';
import {
  DEMO_RELEASE_SIDEBAR_FIXTURES,
  DEMO_RELEASE_VIEW_MODELS,
  FOUNDER_DEMO_RELEASE_SIDEBAR_FIXTURES,
  FOUNDER_DEMO_RELEASE_VIEW_MODELS,
} from './mock-release-data';

type DemoReleasesExperienceVariant = 'internal-dj' | 'founder';

/**
 * DemoReleasesExperience — the full demo page content wrapped in the real
 * authenticated app shell (sidebar, header, nav) fed by mock data.
 *
 * Prospects and screenshots use the same shell release list as `/app/releases`.
 * The demo adapter supplies deterministic fixtures and disables live mutations.
 */
export function DemoReleasesExperience({
  dashboardData,
  variant = 'internal-dj',
}: {
  readonly dashboardData?: DashboardData;
  readonly variant?: DemoReleasesExperienceVariant;
} = {}) {
  const capturePlayer = useSearchParams().get('capturePlayer') === '1';
  const useFounder = variant === 'founder' || capturePlayer;
  const persona = useFounder ? FOUNDER_DEMO_PERSONA : INTERNAL_DJ_DEMO_PERSONA;
  const releases = useFounder
    ? FOUNDER_DEMO_RELEASE_VIEW_MODELS
    : DEMO_RELEASE_VIEW_MODELS;
  const sidebarDataByReleaseId = useFounder
    ? FOUNDER_DEMO_RELEASE_SIDEBAR_FIXTURES
    : DEMO_RELEASE_SIDEBAR_FIXTURES;

  return (
    <DemoAuthShell
      dashboardData={
        dashboardData ?? (useFounder ? FOUNDER_DEMO_DASHBOARD_DATA : undefined)
      }
      releasesForQuery={releases}
    >
      <ShellReleasesView
        releases={releases}
        providerConfig={providerConfig}
        primaryProviders={primaryProviderKeys}
        artistName={persona.profile.displayName}
        allowArtworkDownloads
        spotifyConnected
        appleMusicConnected
        experienceAdapter={createDemoReleaseExperienceAdapter({
          releases,
          sidebarDataByReleaseId,
        })}
      />
    </DemoAuthShell>
  );
}
