import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminVerificationRequired } from './AdminVerificationRequired';

const meta = {
  title: 'Features/Admin/AdminVerificationRequired',
  component: AdminVerificationRequired,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-96 bg-surface-1 p-4'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AdminVerificationRequired>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomMessage: Story = {
  args: {
    message: 'Admin verification required to load pipeline settings.',
  },
};
