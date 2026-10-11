import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import { AuthBackButton } from './AuthBackButton';

const meta = {
  title: 'Features/Auth/AuthBackButton',
  component: AuthBackButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    href: APP_ROUTES.HOME,
    inline: true,
  },
} satisfies Meta<typeof AuthBackButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Inline: Story = {};

export const Fixed: Story = {
  args: {
    inline: false,
  },
};
