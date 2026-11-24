import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  createDashboardQueryClient,
  DashboardStoryProviders,
} from '@/.storybook/dashboard-fixtures';
import { queryKeys } from '@/lib/queries/keys';
import { SettingsTouringSection } from './SettingsTouringSection';

const PROFILE_ID = 'story-profile';

const meta = {
  title: 'Dashboard/Organisms/SettingsTouringSection',
  component: SettingsTouringSection,
  parameters: {
    layout: 'padded',
    connection: {
      connected: false,
      artistName: null,
      lastSyncedAt: null,
      hasApiKey: false,
    },
  },
  args: { profileId: PROFILE_ID },
  decorators: [
    (Story, context) => {
      const client = createDashboardQueryClient();
      client.setQueryData(
        queryKeys.tourDates.connection(PROFILE_ID),
        context.parameters.connection
      );
      return (
        <DashboardStoryProviders queryClient={client}>
          <div className='w-2xl max-w-full'>
            <Story />
          </div>
        </DashboardStoryProviders>
      );
    },
  ],
} satisfies Meta<typeof SettingsTouringSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
