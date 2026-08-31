import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import { AuthShell } from './AuthShell';

const meta = {
  title: 'Auth/AuthShell',
  component: AuthShell,
  parameters: {
    layout: 'padded',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/signup' },
    },
    jovie: {
      uncoveredProps: ['compact', 'appearance', 'initialValues'],
    },
  },
} satisfies Meta<typeof AuthShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignUpSplashB: Story = {
  args: {
    mode: 'sign-up',
    suppressOneTap: true,
    forceOppositeModeHardNavigation: true,
    oppositeModeUrl: APP_ROUTES.SIGNIN,
    fallbackRedirectUrl: APP_ROUTES.START,
  },
};

export const SignIn: Story = {
  args: {
    mode: 'sign-in',
    suppressOneTap: false,
  },
};
