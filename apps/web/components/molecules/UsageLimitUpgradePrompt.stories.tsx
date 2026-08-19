import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { UsageLimitUpgradePrompt } from './UsageLimitUpgradePrompt';

const meta: Meta<typeof UsageLimitUpgradePrompt> = {
  title: 'Molecules/UsageLimitUpgradePrompt',
  component: UsageLimitUpgradePrompt,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  decorators: [
    Story => (
      <div className='w-[32rem]'>
        <Story />
      </div>
    ),
  ],
  args: {
    current: 12,
    limit: 15,
    featureName: 'weekly messages',
    upgradeCopy: '70 messages per week',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const NearLimit: Story = {};

export const Exhausted: Story = {
  args: {
    current: 15,
  },
};
