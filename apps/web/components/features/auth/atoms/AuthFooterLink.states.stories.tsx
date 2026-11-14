import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import { AuthFooterLink } from './AuthFooterLink';

/**
 * State coverage for the auth footer prompt. The canonical story stays in
 * AuthFooterLink.stories.tsx.
 */
const meta = {
  title: 'Features/Auth/AuthFooterLink States',
  component: AuthFooterLink,
  parameters: {
    layout: 'centered',
  },
  args: {
    prompt: "Don't have an account?",
    href: APP_ROUTES.SIGNUP,
    linkText: 'Sign up',
  },
} satisfies Meta<typeof AuthFooterLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a prompt and link long enough to wrap. */
export const LongContentPrompt: Story = {
  args: {
    prompt:
      'Already started setting up a profile for your label or another artist on your roster?',
    linkText: 'Sign in to pick up where you left off',
  },
  decorators: [
    Story => (
      <div className='max-w-xs'>
        <Story />
      </div>
    ),
  ],
};

/** Right-to-left: the prompt inside an RTL document. */
export const RtlDocument: Story = {
  args: { prompt: 'ليس لديك حساب؟', linkText: 'سجّل الآن' },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
