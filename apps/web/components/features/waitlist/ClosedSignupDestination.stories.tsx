import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthLayout } from '@/components/features/auth/AuthLayout';
import { APP_ROUTES } from '@/constants/routes';

const meta = {
  title: 'Marketing/Routes/ClosedSignupDestination',
  component: AuthLayout,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/waitlist' },
    },
    docs: {
      description: {
        component:
          'Temporary anonymous /waitlist destination while public signup is closed. Uses the existing AuthLayout, offers sign-in and emailed-invitation recovery, and makes no saved-request claim.',
      },
    },
  },
} satisfies Meta<typeof AuthLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignupClosed: Story = {
  args: {
    formTitle: 'Jovie is invite-only',
    showFooterPrompt: true,
    footerPrompt: 'Already have an account?',
    footerLinkText: 'Sign in',
    footerLinkHref: APP_ROUTES.SIGNIN,
    layoutVariant: 'stack',
    children: (
      <p className='text-sm text-secondary-token'>
        Public signup is closed. If you received an invitation, open the link in
        your email to continue.
      </p>
    ),
  },
};
