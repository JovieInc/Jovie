import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import { EmailCodeAuthForm } from './EmailCodeAuthForm';

const meta = {
  title: 'Auth/EmailCodeAuthForm',
  component: EmailCodeAuthForm,
  parameters: {
    layout: 'padded',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/signup' },
    },
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
  args: {
    mode: 'sign-up',
    redirectUrl: APP_ROUTES.START,
    initialEmailAddress: 'artist@example.com',
    onOtpStepChange: () => undefined,
  },
} satisfies Meta<typeof EmailCodeAuthForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignUpEmailStep: Story = {};

export const SignInEmailStep: Story = {
  args: {
    mode: 'sign-in',
    redirectUrl: APP_ROUTES.CHAT,
  },
};
