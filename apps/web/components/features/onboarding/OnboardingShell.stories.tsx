import '../../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { OnboardingShell } from './OnboardingShell';

const meta = {
  title: 'Features/Onboarding/OnboardingShell',
  component: OnboardingShell,
  parameters: {
    layout: 'fullscreen',
    chromatic: { viewports: [390, 1024] },
    docs: {
      description: {
        component:
          'The /start entry shell before and after authentication. A verified account keeps the chat but no longer sees a Sign in link.',
      },
    },
  },
  args: {
    sessionLabel: 'story',
    isSignedIn: false,
  },
} satisfies Meta<typeof OnboardingShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Visitor: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Sign in' })).toBeVisible();
  },
};

export const SignedIn: Story = {
  args: { isSignedIn: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('link', { name: 'Sign in' })).toBeNull();
  },
};

/**
 * `/start?handle=timwhite` for an open name (Pen R6As7U): the draft profile
 * panel is present from the first paint, seeded with the claimed handle.
 */
export const ClaimHandleEntry: Story = {
  args: {
    entryProfile: { status: 'available', handle: 'timwhite' },
  },
  parameters: { chromatic: { viewports: [1440] } },
};
