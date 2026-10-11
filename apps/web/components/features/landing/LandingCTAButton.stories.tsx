import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { LandingCTAButton } from './LandingCTAButton';

const meta = {
  title: 'Marketing/Actions/LandingCTAButton',
  component: LandingCTAButton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Existing landing action: auth destinations wait for navigation, public destinations retain Next Link defaults, and clicks retain hero analytics. This component does not expose an explicit prefetch override.',
      },
    },
  },
  args: {
    href: '/start',
    label: 'Get started',
    eventName: 'landing_cta_contract',
    section: 'hero',
  },
  play: async ({ canvasElement, args }) => {
    const link = canvasElement.querySelector<HTMLAnchorElement>('a');
    await expect(link).toBeInTheDocument();
    if (!link)
      throw new Error('The landing action must render its actual link.');
    await expect(link).toHaveAttribute('href', args.href);
    await expect(link).toHaveAccessibleName(args.label);
    link.focus();
    await expect(link).toHaveFocus();
    const clicked = fn();
    link.addEventListener(
      'click',
      event => {
        // Keep the isolated story in place; the real component still handles analytics.
        event.preventDefault();
        clicked();
      },
      { once: true }
    );
    await userEvent.click(link);
    await expect(clicked).toHaveBeenCalledOnce();
  },
} satisfies Meta<typeof LandingCTAButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Start: Story = {};
export const Signup: Story = {
  args: { href: '/signup', label: 'Request access' },
};
export const SignIn: Story = { args: { href: '/signin', label: 'Sign in' } };
export const PublicPricing: Story = {
  args: { href: '/pricing', label: 'See pricing' },
};
export const PublicText: Story = {
  args: { href: '/support', label: 'Talk to the team', variant: 'text' },
};
