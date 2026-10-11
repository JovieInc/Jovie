import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MatchStatusBadge } from './MatchStatusBadge';

const meta = {
  title: 'Dashboard/Atoms/MatchStatusBadge',
  component: MatchStatusBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    status: 'suggested',
  },
  argTypes: {
    status: {
      control: 'select',
      options: ['suggested', 'confirmed', 'auto_confirmed', 'rejected'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md'],
    },
  },
} satisfies Meta<typeof MatchStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Suggested: Story = {};

export const Confirmed: Story = {
  args: { status: 'confirmed' },
};

export const AutoConfirmed: Story = {
  args: { status: 'auto_confirmed' },
};

export const Rejected: Story = {
  args: { status: 'rejected' },
};

export const Small: Story = {
  args: { status: 'confirmed', size: 'sm' },
};

export const AllStatuses: Story = {
  render: () => (
    <div className='flex items-center gap-2'>
      <MatchStatusBadge status='suggested' />
      <MatchStatusBadge status='confirmed' />
      <MatchStatusBadge status='auto_confirmed' />
      <MatchStatusBadge status='rejected' />
    </div>
  ),
};
