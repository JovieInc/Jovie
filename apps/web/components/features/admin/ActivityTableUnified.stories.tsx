import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  ActivityTableSkeleton,
  ActivityTableUnified,
} from './ActivityTableUnified';

const meta = {
  title: 'Admin/Activity/ActivityTableUnified',
  component: ActivityTableUnified,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='min-h-96 p-4'>
        <Story />
      </div>
    ),
  ],
  args: { items: [] },
} satisfies Meta<typeof ActivityTableUnified>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Populated: Story = {
  args: {
    items: [
      {
        id: 'activity-1',
        user: '@operator',
        action: 'Approved a generated playlist',
        timestamp: '2 minutes ago',
        status: 'success',
      },
      {
        id: 'activity-2',
        user: 'System',
        action: 'Publisher connection needs review',
        timestamp: '18 minutes ago',
        status: 'warning',
      },
    ],
  },
};

export const Narrow: Story = {
  ...Populated,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

export const Loading: Story = {
  render: () => <ActivityTableSkeleton rows={5} />,
};
