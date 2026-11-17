import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import {
  LocalCheckoutApi,
  UpgradeQueryProvider,
} from '@/tests/fixtures/upgrade-checkout-story';
import { UsageLimitUpgradePrompt } from './UsageLimitUpgradePrompt';

function CheckoutDecorator(Story: () => ReactNode) {
  return (
    <UpgradeQueryProvider>
      <LocalCheckoutApi reply='server-error'>
        <div className='w-full max-w-lg'>
          <Story />
        </div>
      </LocalCheckoutApi>
    </UpgradeQueryProvider>
  );
}

function NarrowCheckoutDecorator(Story: () => ReactNode) {
  return (
    <UpgradeQueryProvider>
      <LocalCheckoutApi reply='server-error'>
        <div className='w-72'>
          <Story />
        </div>
      </LocalCheckoutApi>
    </UpgradeQueryProvider>
  );
}

function RtlCheckoutDecorator(Story: () => ReactNode) {
  return (
    <UpgradeQueryProvider>
      <LocalCheckoutApi reply='server-error'>
        <div dir='rtl' lang='ar' className='w-full max-w-lg'>
          <Story />
        </div>
      </LocalCheckoutApi>
    </UpgradeQueryProvider>
  );
}

const meta = {
  title: 'Molecules/UsageLimitUpgradePrompt/States',
  component: UsageLimitUpgradePrompt,
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/app' } },
    layout: 'centered',
  },
  decorators: [CheckoutDecorator],
  args: {
    current: 12,
    limit: 15,
    featureName: 'weekly messages',
    upgradeCopy: '70 messages per week',
  },
} satisfies Meta<typeof UsageLimitUpgradePrompt>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: usage below the warning boundary renders nothing. */
export const EmptyBelowBoundary: Story = {
  args: { current: 3 },
};

/** Partial: the required props only, with the default upgrade label. */
export const PartialDefaultCta: Story = {
  args: { current: 13, limit: 15, featureName: 'contacts' },
};

/** Long content: a long feature name and unlock copy in a narrow column. */
export const LongContentNarrow: Story = {
  args: {
    current: 15,
    limit: 15,
    featureName: 'AI-assisted playlist pitch drafts',
    upgradeCopy:
      'unlimited pitch drafts, saved curator lists and weekly follow-up reminders',
  },
  decorators: [NarrowCheckoutDecorator],
};

/** Permission denied: the plan limit is reached and the feature is locked. */
export const PermissionDeniedAtLimit: Story = {
  args: { current: 15, limit: 15 },
};

/** RTL: the warning prompt in a right-to-left layout. */
export const RtlWarning: Story = {
  args: {
    current: 12,
    limit: 15,
    featureName: 'رسائل أسبوعية',
    upgradeCopy: '70 رسالة في الأسبوع',
  },
  decorators: [RtlCheckoutDecorator],
};
