import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
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
      <div className='w-[min(28rem,calc(100vw-2rem))] bg-base p-6'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ToolPartsRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

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
