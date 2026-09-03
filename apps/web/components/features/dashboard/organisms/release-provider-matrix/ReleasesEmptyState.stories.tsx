import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleasesEmptyState } from './ReleasesEmptyState';

const meta = {
  title: 'Features/Dashboard/Releases/ReleasesEmptyState',
  component: ReleasesEmptyState,
  parameters: {
    layout: 'centered',
  },
  args: {
    onConnectSpotify: () => undefined,
    onRetryEnrichment: () => undefined,
  },
  decorators: [
    Story => (
      <div className='w-[min(36rem,calc(100vw-2rem))]'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReleasesEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Disconnected: Story = {};

export const Enriching: Story = {
  args: {
    enrichmentStatus: 'enriching',
  },
};

export const Partial: Story = {
  args: {
    enrichmentStatus: 'partial',
  },
};

export const Failed: Story = {
  args: {
    enrichmentStatus: 'failed',
  },
};
