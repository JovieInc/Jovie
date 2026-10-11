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
