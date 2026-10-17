import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  DashboardStoryProviders,
  DEFAULT_DASHBOARD_DATA,
} from '@/.storybook/dashboard-fixtures';
import { EnhancedDashboardLinks } from './EnhancedDashboardLinks';

const meta = {
  title: 'Dashboard/Organisms/EnhancedDashboardLinks',
  component: EnhancedDashboardLinks,
  parameters: { layout: 'padded' },
  decorators: [
    Story => (
      <DashboardStoryProviders
        dashboardData={{
          ...DEFAULT_DASHBOARD_DATA,
          selectedProfile: {
            ...DEFAULT_DASHBOARD_DATA.selectedProfile!,
            username: 'sashawaves',
            displayName: 'Sasha Waves',
            avatarUrl: null,
            isVerified: true,
          },
        }}
      >
        <Story />
      </DashboardStoryProviders>
    ),
  ],
  args: { initialLinks: [] },
} satisfies Meta<typeof EnhancedDashboardLinks>;
export default meta;
type Story = StoryObj<typeof meta>;
export const EmptyLinks: Story = {};
export const ConnectedProfile: Story = {
  args: {
    initialLinks: [
      {
        id: 'spotify',
        platform: 'spotify',
        platformType: 'dsp',
        url: 'https://open.spotify.com/artist/sashawaves',
        sortOrder: 0,
        isActive: true,
        displayText: null,
        state: 'active',
      },
    ],
  },
};
