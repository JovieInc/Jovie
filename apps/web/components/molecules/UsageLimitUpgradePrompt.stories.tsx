import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  LocalCheckoutApi,
  UpgradeQueryProvider,
} from '@/tests/fixtures/upgrade-checkout-story';
import { UsageLimitUpgradePrompt } from './UsageLimitUpgradePrompt';

const meta: Meta<typeof UsageLimitUpgradePrompt> = {
  title: 'Molecules/UsageLimitUpgradePrompt',
  component: UsageLimitUpgradePrompt,
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/app' } },
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  decorators: [
    Story => (
      <UpgradeQueryProvider>
        <LocalCheckoutApi reply='server-error'>
          <Story />
        </LocalCheckoutApi>
      </UpgradeQueryProvider>
    ),
    Story => (
      <div style={{ width: 'min(32rem, calc(100vw - 2rem))' }}>
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
