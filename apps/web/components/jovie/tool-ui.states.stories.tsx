import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, within } from 'storybook/test';
import { ARTIST_VISIBILITY_OFFER, toCents } from '@/lib/config/plan-prices';
import { queryKeys } from '@/lib/queries/keys';
import { TOOL_STATE_PARTS } from './fixtures/tool-states';
import { ToolPartsRenderer } from './tool-ui';

const meta = {
  title: 'Jovie/Components/ToolPartsRenderer/States',
  component: ToolPartsRenderer,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['profileId', 'hasMessageText', 'feedback'],
    },
  },
  args: {
    variant: 'chat',
    parts: TOOL_STATE_PARTS.loading,
    isStreaming: true,
  },
  decorators: [
    Story => (
      <div className='w-full max-w-md bg-base p-6'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ToolPartsRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The locked-tool upgrade prompt is the one UpgradeButton rendered without a
 * priceId: it resolves its checkout price from the pricing-options query
 * (#25284). The Storybook server has no /api/stripe/pricing-options, so
 * without a seeded answer the button sits disabled at "Loading..." and its
 * upgrade label never renders. Seed the current monthly offer so the prompt
 * settles enabled, exactly as it does on a profile once pricing resolves —
 * the same QueryClientProvider pattern UpgradeButton's own stories use.
 */
const seededPricingOptions: NonNullable<Story['decorators']> = [
  function WithSeededPricingOptions(Story) {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
      },
    });
    client.setQueryData(queryKeys.billing.pricingOptions(), {
      options: [
        {
          priceId: 'price_story_artist_presence_monthly',
          amount: toCents(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd),
          currency: ARTIST_VISIBILITY_OFFER.pro.currency,
          interval: ARTIST_VISIBILITY_OFFER.pro.interval,
          description: 'Storybook artist presence monthly offer',
        },
      ],
    });
    return (
      <QueryClientProvider client={client}>
        <Story />
      </QueryClientProvider>
    );
  },
];

/** Loading: a status tool still running while the stream is open. */
export const LoadingStatusRow: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTestId('tool-status-row')
    ).toHaveAttribute('data-operation-status', 'working');
  },
};

/** Empty: a reply with no tool parts renders no tool UI at all. */
export const EmptyNoToolParts: Story = {
  args: { parts: TOOL_STATE_PARTS.empty, isStreaming: false },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByTestId('tool-activity-feed')
    ).toBeNull();
  },
};

/** Error: a failed status tool is an alert row with its failure body. */
export const ErrorStatusRow: Story = {
  args: { parts: TOOL_STATE_PARTS.error, isStreaming: false },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent(
      'Press source could not be loaded.'
    );
  },
};

/** Partial: one saved and one failed call share one activity timeline. */
export const PartialMixedOutcomes: Story = {
  args: { parts: TOOL_STATE_PARTS.partial, isStreaming: false },
};

/** Long content: four rows with long summaries truncate to one line each. */
export const LongContentActivityFeed: Story = {
  args: { parts: TOOL_STATE_PARTS.longContent, isStreaming: false },
};

/**
 * Offline: the service behind the tool could not be reached. The row names
 * the failure and the retry next step rather than claiming success.
 */
export const OfflineServiceUnreachable: Story = {
  args: { parts: TOOL_STATE_PARTS.offline, isStreaming: false },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent(
      'Retry in a few minutes'
    );
  },
};

/** Permission denied: a plan-locked tool shows a lock row and one upgrade. */
export const PermissionDeniedLockedTool: Story = {
  args: { parts: TOOL_STATE_PARTS.permissionDenied, isStreaming: false },
  decorators: seededPricingOptions,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Upgrade to Max' })
    ).toBeVisible();
  },
};

/** Right-to-left: an Arabic receipt row inside an RTL transcript. */
export const RtlArabicStatusRow: Story = {
  args: { parts: TOOL_STATE_PARTS.rtl, isStreaming: false },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
