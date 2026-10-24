import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect } from 'react';
import { expect, waitFor } from 'storybook/test';
import {
  DashboardStoryProviders,
  DEFAULT_DASHBOARD_DATA,
} from '@/.storybook/dashboard-fixtures';
import { RenderedFamily } from '@/.storybook/rendered-family';
import { withSignedInSession } from '@/.storybook/signed-in-session';
import {
  PreviewPanelProvider,
  usePreviewPanelState,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { PreviewDataHydrator } from '../PreviewDataHydrator';
import { ProfileContactSidebar } from './ProfileContactSidebar';

const profileFixture = DEFAULT_DASHBOARD_DATA.selectedProfile;
if (!profileFixture)
  throw new Error('The dashboard profile fixture is required.');
const dashboardData = {
  ...DEFAULT_DASHBOARD_DATA,
  selectedProfile: {
    ...profileFixture,
    username: 'sashawaves',
    usernameNormalized: 'sashawaves',
    displayName: 'Sasha Waves',
  },
};

/** Exercise an explicitly opened rail; defaultOpen only opens on desktop. */
function OpenProfileRail() {
  const { open } = usePreviewPanelState();
  useEffect(() => open(), [open]);
  return null;
}

const meta = {
  title: 'Dashboard/ProfileContactSidebar',
  component: ProfileContactSidebar,
  parameters: { layout: 'fullscreen' },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      expect(
        canvasElement.ownerDocument.getElementById('shell-artist-profile-rail')
      ).toHaveAttribute('aria-hidden', 'false');
    });
  },
  decorators: [
    (Story, context) => (
      <RenderedFamily
        name='ProfileContactSidebar'
        owner='ProfileContactSidebar'
        interactive={context.name !== 'Loading'}
        targetSelector='#shell-artist-profile-rail'
        surfaceToken='--app-shell-content-surface'
      >
        <Story />
      </RenderedFamily>
    ),
    Story => (
      <DashboardStoryProviders dashboardData={dashboardData}>
        <Story />
      </DashboardStoryProviders>
    ),
    withSignedInSession,
  ],
} satisfies Meta<typeof ProfileContactSidebar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loading: Story = {
  render: () => (
    <PreviewPanelProvider defaultOpen>
      <OpenProfileRail />
      <ProfileContactSidebar />
    </PreviewPanelProvider>
  ),
};
export const Hydrated: Story = {
  render: () => (
    <PreviewPanelProvider defaultOpen>
      <OpenProfileRail />
      <PreviewDataHydrator initialLinks={[]} connectedDSPs={[]} />
      <ProfileContactSidebar />
    </PreviewPanelProvider>
  ),
};
