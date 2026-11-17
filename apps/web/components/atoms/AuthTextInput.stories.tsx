import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthTextInput } from './AuthTextInput';

const meta = {
  title: 'Atoms/AuthTextInput',
  component: AuthTextInput,
  parameters: {
    layout: 'centered',
  },
  args: {
    placeholder: 'you@example.com',
    'aria-label': 'Email address',
  },
  render: args => (
    <div className='w-72'>
      <AuthTextInput {...args} />
    </div>
  ),
} satisfies Meta<typeof AuthTextInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Otp: Story = {
  args: {
    variant: 'otp',
    placeholder: '000000',
    'aria-label': 'One-time code',
  },
};

export const WithValue: Story = {
  args: {
    defaultValue: 'artist@jov.ie',
  },
};

export const Disabled: Story = {
  args: {
    defaultValue: 'artist@jov.ie',
    disabled: true,
  },
};

/** A long address scrolls inside the field rather than widening it. */
export const LongContent: Story = {
  args: {
    defaultValue:
      'booking.and.management.team.for.the.collective@example-records-group.com',
  },
};

/** The field inside a right-to-left page; typed text follows the page direction. */
export const Rtl: Story = {
  args: {
    placeholder: 'البريد الإلكتروني',
    'aria-label': 'البريد الإلكتروني',
  },
  render: args => (
    <div dir='rtl' className='w-72'>
      <AuthTextInput {...args} />
    </div>
  ),
};
