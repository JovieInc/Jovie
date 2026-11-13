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

/** No eligible next step: the welcome keeps the profile review path. */
export const EmptyNoNextStep: Story = {
  args: { action: null },
};

/** No first name resolved: a plain time-of-day welcome, same next step. */
export const PartialNoFirstName: Story = {
  args: { firstName: null },
};

export const LongNameAndSuggestion: Story = {
  args: {
    firstName: 'The Extraordinarily Long Touring Ensemble Of Northern Lights',
    action: {
      insightId: 'long-fixture',
      suggestion:
        'Draft a fan update about the three new cities on the winter run, the rescheduled hometown show and the limited vinyl pressing that sold through overnight',
      prompt: 'Help me draft a fan update. Ask for missing facts.',
      expiresAt: Date.parse('2099-01-01T00:00:00Z'),
    },
    onSelectAction: fn(),
  },
};

export const RtlGreeting: Story = {
  args: {
    firstName: 'ليلى',
    action: {
      insightId: 'rtl-fixture',
      suggestion: 'اكتب تحديثًا للمعجبين عن الإصدار الجديد',
      prompt: 'Help me draft a fan update. Ask for missing facts.',
      expiresAt: Date.parse('2099-01-01T00:00:00Z'),
    },
    onSelectAction: fn(),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
