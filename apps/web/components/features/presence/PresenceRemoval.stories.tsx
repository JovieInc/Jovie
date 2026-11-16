import '../../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionGlobalConfig } from 'motion/react';
import { useEffect, useState } from 'react';
import { ProfilesWorkspace } from '@/app/app/(shell)/profiles/ProfilesWorkspace';
import { AppShellRightRail } from '@/components/shell/AppShellRightRail';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import { applyCacheScope } from '@/lib/queries/cache-isolation';
import type {
  ProfilesWorkspaceData,
  ProfileWorkspaceSurfaceRow,
} from './types';

const row: ProfileWorkspaceSurfaceRow = {
  id: 'synthetic-surface',
  rowType: 'surface',
  kind: 'social',
  platform: 'soundcloud',
  label: 'Fixture Artist',
  handle: '@fixture-artist',
  url: 'https://soundcloud.com/fixture-artist-with-a-long-saved-profile-address',
  trackedUrl: null,
  qualificationStatus: 'qualified',
  isOfficial: false,
  monitoringState: 'unavailable',
  rank: null,
  previousRank: null,
  lastObservedAt: null,
  removalTarget: {
    linkId: 'synthetic-link',
    url: 'https://soundcloud.com/fixture-artist-with-a-long-saved-profile-address',
    version: 3,
  },
};
const data: ProfilesWorkspaceData = {
  profileId: 'synthetic-profile',
  artist: {
    name: 'Fixture Artist',
    username: 'fixture-artist',
    avatarUrl: null,
    isPublic: true,
  },
  rows: [
    row,
    {
      ...row,
      id: 'synthetic-jovie',
      kind: 'jovie',
      platform: 'jovie',
      url: 'https://jov.ie/fixture-artist',
      removalTarget: undefined,
    },
  ],
  monitoringLimit: null,
  monitoredCount: 1,
  qualifiedShare: 1,
  bestJovieRank: null,
  lastObservedAt: null,
  providerAvailable: false,
};
function RemovalPanel() {
  const panel = useRightPanel();
  return panel ? <AppShellRightRail>{panel}</AppShellRightRail> : null;
}
function RemovalFixture() {
  useEffect(() => {
    const previous = MotionGlobalConfig.skipAnimations;
    MotionGlobalConfig.skipAnimations = false;
    return () => {
      MotionGlobalConfig.skipAnimations = previous;
    };
  }, []);
  const [client] = useState(() => {
    applyCacheScope({
      ready: true,
      userId: 'synthetic-auth-actor',
      sessionId: 'synthetic-session',
      profileId: data.profileId,
    });
    return new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  return (
    <QueryClientProvider client={client}>
      <HeaderActionsProvider>
        <RightPanelProvider>
          <section
            aria-label='Synthetic saved link removal'
            className='flex h-screen min-w-0 overflow-hidden bg-surface-0'
          >
            <ProfilesWorkspace
              removalPrincipal={{
                appActorId: 'synthetic-actor',
                authUserId: 'synthetic-auth-actor',
                sessionId: 'synthetic-session',
                impersonationSubject: null,
              }}
              data={data}
              scope={{
                actorId: 'synthetic-actor',
                workspaceId: data.profileId,
                target: 'creator',
              }}
            />
            <RemovalPanel />
          </section>
        </RightPanelProvider>
      </HeaderActionsProvider>
    </QueryClientProvider>
  );
}
const meta = {
  title: 'Presence/SavedLinkRemoval',
  component: RemovalFixture,
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } },
} satisfies Meta<typeof RemovalFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Confirmation: Story = {};
