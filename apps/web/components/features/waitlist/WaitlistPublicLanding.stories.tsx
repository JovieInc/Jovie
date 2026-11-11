import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { WaitlistPublicLanding } from './WaitlistPublicLanding';

const meta = {
  title: 'Marketing/Routes/WaitlistPublicLanding',
  component: WaitlistPublicLanding,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/waitlist' },
    },
  },
} satisfies Meta<typeof WaitlistPublicLanding>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SplashB: Story = {};

export const SignupClosed: Story = {
  args: { signupClosed: true },
  // The closed-signup handoff the nightly canary asserts (JOV-7653): the
  // role form must render live interactive controls, never a dead end.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const form = canvas.getByTestId('waitlist-role-form');
    await expect(form).toBeVisible();
    const liveControls = form.querySelectorAll(
      'input:not([disabled]), button:not([disabled])'
    );
    await expect(liveControls.length).toBeGreaterThan(0);
  },
};
