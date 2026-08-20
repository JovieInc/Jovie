import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Search } from 'lucide-react';
import { EmptyState } from './EmptyState';

const meta: Meta<typeof EmptyState> = {
  title: 'UI/Molecules/EmptyState',
  component: EmptyState,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    heading: 'No Results Found',
    description: 'Try a different search or clear the current filters.',
    icon: <Search className='h-5 w-5' aria-hidden='true' />,
  },
};

export const Workspace: Story = {
  args: {
    heading: 'No Contacts Yet',
    description: 'Add bookings, management, and press contacts.',
    presentation: 'workspace',
  },
  render: args => (
    <div className='flex h-96 w-[min(40rem,calc(100vw-2rem))] bg-(--app-shell-content-surface)'>
      <EmptyState {...args} />
    </div>
  ),
};

export const DisabledAction: Story = {
  args: {
    heading: 'Preparing Contacts',
    description: 'Your contacts will be ready shortly.',
    action: {
      label: 'Preparing…',
      onClick: () => undefined,
      disabled: true,
    },
  },
};
