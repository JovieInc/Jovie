import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerEntityAvatar } from './DrawerEntityAvatar';

const meta = {
  title: 'Molecules/Drawer/DrawerEntityAvatar',
  component: DrawerEntityAvatar,
  parameters: { layout: 'centered' },
  args: { name: 'Alex Rivera', src: null },
} satisfies Meta<typeof DrawerEntityAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initials: Story = {};

export const WithImage: Story = {
  args: { src: '/avatars/default-user.png' },
};
