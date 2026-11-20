import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { InlineOfflineNotice } from './inline-offline';

const meta: Meta<typeof InlineOfflineNotice> = {
  title: 'shadcn/InlineOffline',
  component: InlineOfflineNotice,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Inline offline/retry pattern for data-backed blocks. Uses data-state="offline" with warning surface tokens.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onRetry: () => undefined,
  },
  decorators: [
    Story => (
      <div className='max-w-md'>
        <Story />
      </div>
    ),
  ],
};

export const WithoutRetry: Story = {
  args: {
    message: 'Offline — showing cached audience stats.',
  },
  decorators: [
    Story => (
      <div className='max-w-md'>
        <Story />
      </div>
    ),
  ],
};

export const NarrowLongMessage: Story = {
  args: {
    message:
      'You are offline. Cached audience data remains available, and pending changes will sync automatically when the connection returns.',
    retryLabel: 'Try again',
    onRetry: () => undefined,
  },
  decorators: [
    Story => (
      <div className='w-64'>
        <Story />
      </div>
    ),
  ],
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

export const Partial: Story = {
  args: {
    message: 'Offline — showing audience stats cached 2 hours ago.',
  },
  decorators: [
    Story => (
      <div className='max-w-md'>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'Only a message is passed: with no onRetry handler the notice renders without its retry action.',
      },
    },
  },
};

export const LongContent: Story = {
  args: {
    message:
      'You are offline. Your cached release analytics, audience growth and payout history remain visible, and every pending edit will sync automatically once the connection returns.',
    retryLabel: 'Reconnect and refresh',
    onRetry: () => undefined,
  },
  decorators: [
    Story => (
      <div className='w-56'>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'A long message and a long retry label in a narrow container wrap onto separate rows instead of overflowing.',
      },
    },
  },
};

export const Rtl: Story = {
  args: {
    message: 'يبدو أنك غير متصل. ستتم مزامنة التغييرات عند عودة الاتصال.',
    retryLabel: 'إعادة المحاولة',
    onRetry: () => undefined,
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-64'>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'Arabic copy aligns to the start edge and the retry action follows on the left in a right-to-left layout.',
      },
    },
  },
};
