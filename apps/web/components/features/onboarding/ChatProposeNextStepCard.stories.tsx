import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatProposeNextStepCard } from './ChatProposeNextStepCard';

const meta = {
  title: 'Features/Onboarding/ChatProposeNextStepCard',
  component: ChatProposeNextStepCard,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ChatProposeNextStepCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InstantAccess: Story = {
  args: {
    payload: {
      action: 'propose_next_step',
      decision: {
        kind: 'instant_access',
        rationale: 'High-intent artist with an active release.',
        score: 0.92,
      },
    },
  },
};

export const Waitlist: Story = {
  args: {
    payload: {
      action: 'propose_next_step',
      decision: {
        kind: 'waitlist',
        rationale: 'Early-stage artist, low urgency.',
        score: 0.34,
      },
    },
  },
};

export const NeedsMoreInfo: Story = {
  args: {
    payload: {
      action: 'propose_next_step',
      decision: {
        kind: 'needs_more_info',
        rationale: 'Not enough signal yet.',
        score: 0.5,
      },
    },
  },
};
