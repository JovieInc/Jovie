import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceLastCell } from './AudienceLastCell';
import { NowMsProvider } from './NowMsContext';

const meta = {
  title: 'Dashboard/Organisms/DashboardAudienceTable/Cells/AudienceLastCell',
  component: AudienceLastCell,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <NowMsProvider>
        <Story />
      </NowMsProvider>
    ),
  ],
} satisfies Meta<typeof AudienceLastCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RecentlySeen: Story = {
  args: {
    lastSeenAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  },
};

export const SeenDaysAgo: Story = {
  args: {
    lastSeenAt: new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString(),
  },
};

export const NeverSeen: Story = {
  args: {
    lastSeenAt: null,
  },
};
