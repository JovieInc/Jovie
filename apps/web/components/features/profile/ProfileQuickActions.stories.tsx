import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ProfileQuickActions } from './ProfileQuickActions';

const meta: Meta<typeof ProfileQuickActions> = {
  title: 'Profile/ProfileQuickActions',
  component: ProfileQuickActions,
  parameters: { layout: 'centered' },
  args: {
    activeMode: 'profile',
    onModeSelect: fn(),
    onBookClick: fn(),
  },
  decorators: [
    Story => (
      <div className='dark w-96 bg-base text-primary-token'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ProfileQuickActions>;

export const Default: Story = {};

export const EventsActive: Story = {
  args: { activeMode: 'tour' },
};

export const BookingDisabled: Story = {
  args: { bookingDisabled: true },
};
