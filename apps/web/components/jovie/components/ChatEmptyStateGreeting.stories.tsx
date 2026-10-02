import '../../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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

/** JOV-7150: no real insight exists — the greeting stands alone. */
export const GreetingOnly: Story = {
  args: {
    insight: null,
  },
};

/** JOV-7150: a real, server-computed insight (release momentum, a stat
 * change, or similar) replaces the greeting as the single sentence. */
export const WithInsight: Story = {
  args: {
    insight: 'Your streams are up 320% today.',
  },
};

/**
 * JOV-7150: never fabricate a number. When the insight source is empty
 * (no active insight, profile not newly complete), the caller resolves
 * `insight` to `null` rather than inventing one — same render as
 * `GreetingOnly`, named separately to document the no-fabrication
 * contract explicitly (see `resolveChatEmptyStateInsight`).
 */
export const NoInsightWhenSourceIsEmpty: Story = {
  args: {
    insight: null,
  },
};
