// Private synthetic investigation only: real components, not a production
// screenshot, approved layout, authenticated route or native Mac build.

import { CommonDropdown } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ProfilesWorkspaceData } from '../../app/app/(shell)/profiles/data';
import { ProfilesWorkspace } from '../../app/app/(shell)/profiles/ProfilesWorkspace';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '../../contexts/HeaderActionsContext';
import {
  RightPanelProvider,
  useRightPanel,
} from '../../contexts/RightPanelContext';

const data: ProfilesWorkspaceData = {
  profileId: '11111111-1111-4111-8111-111111111111',
  artist: {
    name: 'Studio Example',
    username: 'studio_example',
    avatarUrl: null,
    isPublic: true,
  },
  rows: [
    {
      id: 'jovie-fixture',
      rowType: 'surface',
      kind: 'jovie',
      platform: 'jovie',
      label: 'Jovie Profile',
      handle: '@studio_example',
      url: 'https://example.invalid/studio',
      trackedUrl: null,
      qualificationStatus: 'qualified',
      isOfficial: true,
      monitoringState: 'active',
      rank: 2,
      previousRank: 4,
      lastObservedAt: '2026-01-15T00:00:00.000Z',
    },
    {
      id: 'tidal-fixture',
      rowType: 'surface',
      kind: 'dsp',
      platform: 'tidal',
      label: 'Tidal',
      handle: null,
      url: 'https://example.invalid/tidal/studio',
      trackedUrl: null,
      qualificationStatus: 'qualified',
      isOfficial: true,
      monitoringState: 'locked',
      rank: null,
      previousRank: null,
      lastObservedAt: '2026-01-15T00:00:00.000Z',
    },
    {
      id: 'spotify-fixture',
      rowType: 'surface',
      kind: 'dsp',
      platform: 'spotify',
      label: 'Spotify',
      handle: null,
      url: 'https://example.invalid/spotify/studio',
      trackedUrl: null,
      qualificationStatus: 'qualified',
      isOfficial: true,
      monitoringState: 'active',
      rank: null,
      previousRank: null,
      lastObservedAt: '2026-01-15T00:00:00.000Z',
    },
  ],
  monitoringLimit: 1,
  monitoredCount: 1,
  qualifiedShare: 1,
  bestJovieRank: 2,
  lastObservedAt: '2026-01-15T00:00:00.000Z',
  providerAvailable: true,
};

function RegisteredRail() {
  const panel = useRightPanel();
  return (
    <aside className='w-96 shrink-0' data-testid='investigation-rail'>
      {panel}
    </aside>
  );
}

function RegisteredHeader() {
  const { headerActions } = useHeaderActions();
  return <div data-testid='investigation-header'>{headerActions}</div>;
}

function WorkspaceFixture() {
  return (
    <RightPanelProvider>
      <HeaderActionsProvider>
        <div
          className='bg-base text-primary-token'
          data-testid='private-profiles-investigation'
        >
          <p className='px-3 py-2 text-xs'>
            Private synthetic component investigation · no account or provider
            actions
          </p>
          <RegisteredHeader />
          <div className='flex min-h-screen gap-3'>
            <div className='min-w-0 flex-1'>
              <ProfilesWorkspace
                data={data}
                scope={{
                  actorId: 'synthetic-actor',
                  workspaceId: 'synthetic-workspace',
                  target: 'creator',
                }}
              />
            </div>
            <RegisteredRail />
          </div>
        </div>
      </HeaderActionsProvider>
    </RightPanelProvider>
  );
}

const meta = {
  title: 'Verification/ProfilesMenuInvestigation',
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/app/profiles' } },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj;

export const Workspace: Story = { render: () => <WorkspaceFixture /> };

export const NestedControl: Story = {
  render: () => (
    <div className='p-8'>
      <CommonDropdown
        trigger={<button type='button'>Nested menu control</button>}
        items={[
          {
            type: 'submenu',
            id: 'share',
            label: 'Share',
            items: [
              {
                type: 'action',
                id: 'copy',
                label: 'Copy fixture link',
                onClick: () => undefined,
              },
            ],
          },
        ]}
      />
    </div>
  ),
};
