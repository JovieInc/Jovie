import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthInput } from './AuthInput';

const meta = {
  title: 'Features/Auth/AuthInput',
  component: AuthInput,
  parameters: {
    layout: 'centered',
  },
  render: args => (
    <div className='w-72'>
      <AuthInput {...args} />
    </div>
  ),
  args: {
    type: 'email',
    placeholder: 'you@example.com',
  },
} satisfies Meta<typeof AuthInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Email: Story = {};

export const Text: Story = {
  args: {
    type: 'text',
    placeholder: 'Display name',
  },
};

export const ErrorState: Story = {
  args: {
    error: true,
  },
};

/** A long email address scrolls inside the pill instead of widening the column. */
export const LongContentEmail: Story = {
  args: {
    defaultValue: 'booking.and.management.team@example-records-group.com',
  },
};

/** The email field inside a right-to-left page. */
export const Rtl: Story = {
  args: {
    defaultValue: 'artist@example.com',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
