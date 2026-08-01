import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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
    profileHref: '/app/settings/profile',
    settingsHref: '/app/settings',
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
