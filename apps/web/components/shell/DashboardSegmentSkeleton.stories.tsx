import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardSegmentSkeleton } from './DashboardSegmentSkeleton';

const meta = {
  title: 'Shell/DashboardSegmentSkeleton',
  component: DashboardSegmentSkeleton,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof DashboardSegmentSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Admin: Story = {
  args: {
    variant: 'admin',
  },
};

export const Insights: Story = {
  args: {
    variant: 'insights',
  },
};

export const Profile: Story = {
  args: {
    variant: 'profile',
  },
};

export const Tour: Story = {
  args: {
    variant: 'tour',
  },
};

/** The skeleton is the loading state of every dashboard segment. */
export const LoadingDashboard: Story = {
  args: {
    variant: 'default',
  },
};

export const Rtl: Story = {
  args: {
    variant: 'profile',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
