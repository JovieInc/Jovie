import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import { AuthFooterLink } from './AuthFooterLink';

const meta = {
  title: 'Features/Auth/AuthFooterLink',
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

export const Default: Story = {};
