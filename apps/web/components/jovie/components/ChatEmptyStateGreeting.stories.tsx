import '../../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ChatEmptyStateGreeting } from './ChatEmptyStateGreeting';

const meta = {
  title: 'Chat/EmptyState/Greeting',
  component: ChatEmptyStateGreeting,
  parameters: { layout: 'fullscreen' },
  args: {
    firstName: 'Tim',
  },
  decorators: [
    Story => (
      <div className='flex min-h-64 items-center justify-center bg-base p-6'>
        <div className='w-full max-w-2xl'>
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ChatEmptyStateGreeting>;

export default meta;
type Story = StoryObj<typeof meta>;

/** JOV-7150: no eligible Insight — welcome plus the existing profile review path. */
export const GreetingOnly: Story = {
  args: {
    insight: null,
  },
};

/** Synthetic action fixture; no success or growth claim is inferred. */
export const WithInsight: Story = {
  args: {
    action: {
      insightId: 'release-fixture',
      suggestion: 'Draft a release update',
      prompt:
        'Help me draft an update about this release. Ask for missing facts.',
      expiresAt: Date.parse('2099-01-01T00:00:00Z'),
    },
    onSelectAction: fn(),
  },
};

/**
 * JOV-7150: never fabricate a number. When the insight source is empty
 * (no current actionable insight), the caller resolves the action
 * to `null` rather than inventing one — same render as
 * `GreetingOnly`, named separately to document the no-fabrication
 * contract explicitly (see `resolveChatEmptyStateInsight`).
 */
export const NoInsightWhenSourceIsEmpty: Story = {
  args: {
    insight: null,
  },
};

export const LoadingNextStep: Story = {
  args: { isLoading: true },
};
