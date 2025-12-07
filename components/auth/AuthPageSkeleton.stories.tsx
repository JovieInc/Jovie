import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthPageSkeleton } from './AuthPageSkeleton';

const meta: Meta<typeof AuthPageSkeleton> = {
  title: 'Auth/AuthPageSkeleton',
  component: AuthPageSkeleton,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof AuthPageSkeleton>;

export const SignIn: Story = {
  args: {
    formTitle: 'Sign in to Jovie',
    footerPrompt: "Don't have access?",
    footerLinkText: 'Join the waitlist',
    footerLinkHref: '/waitlist',
  },
};

export const SignUp: Story = {
  args: {
    formTitle: 'Create your account',
    footerPrompt: 'Already have an account?',
    footerLinkText: 'Sign in',
    footerLinkHref: '/signin',
  },
};

export const Waitlist: Story = {
  args: {
    formTitle: 'Join the Waitlist',
    footerPrompt: 'Already have access?',
    footerLinkText: 'Sign in',
    footerLinkHref: '/signin',
  },
};
