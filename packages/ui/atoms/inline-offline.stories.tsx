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
