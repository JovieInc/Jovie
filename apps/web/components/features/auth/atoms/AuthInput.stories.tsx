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
