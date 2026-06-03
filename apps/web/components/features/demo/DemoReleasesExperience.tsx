'use client';

import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import {
  primaryProviderKeys,
  providerConfig,
} from '@/app/app/(shell)/dashboard/releases/config';
import { ReleasesExperience } from '@/features/dashboard/organisms/release-provider-matrix';
import {
  FOUNDER_DEMO_PERSONA,
  INTERNAL_DJ_DEMO_PERSONA,
} from '@/lib/demo-personas';
import { DemoAuthShell } from './DemoAuthShell';
import { createDemoReleaseExperienceAdapter } from './demo-release-experience-adapter';
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
 * Accepts optional dashboardData from a server component that fetches
 * a featured creator from the DB via getDemoCreator().
 */
export function DemoReleasesExperience({
  dashboardData,
  variant = 'internal-dj',
}: {
  readonly dashboardData?: DashboardData;
  readonly variant?: DemoReleasesExperienceVariant;
} = {}) {
  const persona =
    variant === 'founder' ? FOUNDER_DEMO_PERSONA : INTERNAL_DJ_DEMO_PERSONA;
  const releases =
    variant === 'founder'
      ? FOUNDER_DEMO_RELEASE_VIEW_MODELS
      : DEMO_RELEASE_VIEW_MODELS;
  const sidebarDataByReleaseId =
    variant === 'founder'
      ? FOUNDER_DEMO_RELEASE_SIDEBAR_FIXTURES
      : DEMO_RELEASE_SIDEBAR_FIXTURES;

  return (
    <DemoAuthShell dashboardData={dashboardData} releasesForQuery={releases}>
      <ReleasesExperience
        releases={releases}
        providerConfig={providerConfig}
        primaryProviders={primaryProviderKeys}
        spotifyConnected
        spotifyArtistName={persona.profile.displayName}
        appleMusicConnected
        appleMusicArtistName={persona.profile.displayName}
        allowArtworkDownloads
        experienceAdapter={createDemoReleaseExperienceAdapter({
          releases,
          sidebarDataByReleaseId,
        })}
      />
    </DemoAuthShell>
  );
}
