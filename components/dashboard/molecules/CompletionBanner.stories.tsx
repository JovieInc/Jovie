import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CompletionBanner } from './CompletionBanner';

const meta: Meta<typeof CompletionBanner> = {
  title: 'Dashboard/Molecules/CompletionBanner',
  component: CompletionBanner,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof CompletionBanner>;

export const Default: Story = {
  decorators: [
    Story => (
      <div className='w-96'>
        <Story />
      </div>
    ),
  ],
};

export const InDashboard: Story = {
  render: () => (
    <div className='w-96 space-y-4 p-4 border border-subtle rounded-xl bg-surface'>
      <h2 className='text-lg font-semibold'>Setup Progress</h2>
      <CompletionBanner />
      <p className='text-sm text-secondary'>
        Your profile is now live and ready to share with your fans.
      </p>
    </div>
  ),
};
