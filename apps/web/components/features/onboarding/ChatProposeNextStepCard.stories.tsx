import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { withOnboardingFixture } from '../../../.storybook/onboarding-fixtures';
import { ChatProposeNextStepCard } from './ChatProposeNextStepCard';

const meta = {
  title: 'Features/Onboarding/ChatProposeNextStepCard',
  component: ChatProposeNextStepCard,
  decorators: [withOnboardingFixture],
  parameters: {
    layout: 'padded',
    chromatic: { viewports: [390, 1280] },
    onboarding: { authUi: true },
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

export const InstantAccessSignedIn: Story = {
  args: InstantAccess.args,
  parameters: { onboarding: { signedIn: true } },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/already signed in/)
    ).toBeVisible();
  },
};

export const InstantAccessAuthUnavailable: Story = {
  args: InstantAccess.args,
  parameters: { onboarding: { authUi: false } },
};
export const WaitlistSignedIn: Story = {
  args: Waitlist.args,
  parameters: { onboarding: { signedIn: true } },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/Saving your request/)
    ).toBeVisible();
    await expect(within(canvasElement).queryByRole('textbox')).toBeNull();
  },
};
export const WaitlistSignedOut: Story = {
  args: Waitlist.args,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('textbox', { name: /email/i })
    ).toBeVisible();
  },
};
export const WaitlistAuthUnavailable: Story = {
  args: Waitlist.args,
  parameters: { onboarding: { authUi: false } },
};
