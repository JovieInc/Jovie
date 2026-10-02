import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import { AuthLink } from './AuthLink';

const meta = {
  title: 'Features/Auth/AuthLink',
  component: AuthLink,
  parameters: {
    layout: 'centered',
  },
  args: {
    href: APP_ROUTES.SIGNUP,
    children: 'Sign up',
  },
} satisfies Meta<typeof AuthLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
