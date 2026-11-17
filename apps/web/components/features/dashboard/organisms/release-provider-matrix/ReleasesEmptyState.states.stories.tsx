import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ReleasesEmptyState } from './ReleasesEmptyState';

const withColumn: Decorator = Story => (
  <div className='w-full max-w-xl'>
    <Story />
  </div>
);

const withRtlColumn: Decorator = Story => (
  <div dir='rtl' className='w-full max-w-xl'>
    <Story />
  </div>
);

const meta = {
  title: 'Features/Dashboard/Releases/ReleasesEmptyState States',
  component: ReleasesEmptyState,
  parameters: { layout: 'centered' },
  args: {
    onConnectSpotify: fn(),
    onRetryEnrichment: fn(),
  },
} satisfies Meta<typeof ReleasesEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no Spotify connection yet, so the table offers to connect. */
export const EmptyDisconnected: Story = {
  decorators: [withColumn],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByTestId('releases-empty-state-disconnected')
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Connect Spotify' })
    );
    await expect(args.onConnectSpotify).toHaveBeenCalledTimes(1);
  },
};

/** Empty: a partial search with no retry handler shows no action. */
export const EmptyPartialWithoutRetry: Story = {
  args: { enrichmentStatus: 'partial', onRetryEnrichment: undefined },
  decorators: [withColumn],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'Some Music Found' })
    ).toBeVisible();
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};

/** Right-to-left: the failed search state inside an RTL document. */
export const RtlFailed: Story = {
  args: { enrichmentStatus: 'failed' },
  decorators: [withRtlColumn],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Try Again' })
    ).toBeVisible();
  },
};
