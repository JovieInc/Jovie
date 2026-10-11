import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AccountDashboard } from './AccountDashboard';

const meta: Meta<typeof AccountDashboard> = {
  title: 'Organisms/AccountDashboard',
  component: AccountDashboard,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='mx-auto max-w-5xl p-6'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
