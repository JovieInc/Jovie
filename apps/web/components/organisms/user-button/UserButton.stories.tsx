import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import { UserButton } from './UserButton';

const meta: Meta<typeof UserButton> = {
  title: 'Organisms/UserButton',
  component: UserButton,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled', 'loading'],
    },
  },
  args: {
    showUserInfo: true,
    profileHref: APP_ROUTES.SETTINGS_PROFILE,
    settingsHref: APP_ROUTES.SETTINGS,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Compact: Story = {
  args: {
    showUserInfo: false,
  },
};
