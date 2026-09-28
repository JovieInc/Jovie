import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminStepUpBanner } from './AdminStepUpBanner';

const meta = {
  title: 'Features/Admin/AdminStepUpBanner',
  component: AdminStepUpBanner,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='min-h-24 bg-surface-1'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AdminStepUpBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Locked: Story = {};
