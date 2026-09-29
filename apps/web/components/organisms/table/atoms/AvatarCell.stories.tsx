import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AvatarCell } from './AvatarCell';

const meta = {
  title: 'Organisms/Table/Atoms/AvatarCell',
  component: AvatarCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    profileId: 'artist-1',
    username: 'tim',
    avatarUrl: null,
    displayName: 'Tim White',
  },
} satisfies Meta<typeof AvatarCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Verified: Story = {
  args: {
    verified: true,
  },
};

export const Featured: Story = {
  args: {
    isFeatured: true,
  },
};

export const UsernameOnly: Story = {
  args: {
    displayName: null,
  },
};

export const DisabledLink: Story = {
  args: {
    disableUsernameLink: true,
  },
};
