import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthPageSkeleton } from './AuthPageSkeleton';

/**
 * State coverage for the auth page loading placeholder. The per-route stories
 * stay in AuthPageSkeleton.stories.tsx.
 */
const meta: Meta<typeof AuthPageSkeleton> = {
  title: 'Auth/AuthPageSkeleton States',
  component: AuthPageSkeleton,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof AuthPageSkeleton>;

/** Loading: the sign-in route while its form is still loading. */
export const LoadingSignIn: Story = {
  args: {
    formTitle: 'Sign in to Jovie',
    showFormTitle: false,
    layoutVariant: 'stack',
    chrome: 'splash-b',
  },
};

/** Loading: the split layout with a visible title and footer prompt. */
export const LoadingSplitWithFooter: Story = {
  args: {
    formTitle: 'Create your account',
    showFormTitle: true,
    showFooterPrompt: true,
    layoutVariant: 'split',
    footerPrompt: 'Already have an account?',
    footerLinkText: 'Sign in',
    footerLinkHref: '/signin',
  },
};
