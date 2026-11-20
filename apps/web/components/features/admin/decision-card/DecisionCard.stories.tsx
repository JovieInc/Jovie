import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DecisionCard } from './DecisionCard';
import { DECISION_CARD_STORY_STATES } from './fixtures';

const meta = {
  title: 'Features/Admin/DecisionCard',
  component: DecisionCard,
  parameters: { layout: 'padded', backgrounds: { default: 'dark' } },
  decorators: [
    Story => (
      <ContentSurfaceCard className='max-w-xl'>
        <div className='p-4'>
          <Story />
        </div>
      </ContentSurfaceCard>
    ),
  ],
  args: {
    discussHref: '/app/ov/chat?discuss=summer-card%3Asc_ef84c09c',
    onApprove: fn(),
    onReject: fn(),
    onRetry: fn(),
    ...DECISION_CARD_STORY_STATES.Pending,
  },
} satisfies Meta<typeof DecisionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default plus a calm deadline: the common case. */
export const Pending: Story = { args: DECISION_CARD_STORY_STATES.Pending };

/** Under two hours left: the deadline takes the warning accent. */
export const NearDeadline: Story = {
  args: DECISION_CARD_STORY_STATES.NearDeadline,
};

/** Tim decided; the action slot holds the outcome. */
export const Decided: Story = { args: DECISION_CARD_STORY_STATES.Decided };

/** The deadline recorded the default; Discuss stays for post-ship feedback. */
export const AutoShipped: Story = {
  args: DECISION_CARD_STORY_STATES.AutoShipped,
};

/** The write failed; the card stays with Retry. */
export const ErrorState: Story = {
  name: 'Error',
  args: DECISION_CARD_STORY_STATES.Error,
};
