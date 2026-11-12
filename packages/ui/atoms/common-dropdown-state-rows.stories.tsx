import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EmptyState, LoadingState } from './common-dropdown-state-rows';

const meta = {
  title: 'UI/Atoms/CommonDropdown/StateRows',
  component: EmptyState,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** While the menu's items load: one inert row with a polite status. */
export const Loading: Story = {
  render: () => <LoadingState />,
};

/** When the filter matches nothing. */
export const Empty: Story = {
  render: () => <EmptyState message='No actions found' />,
};
