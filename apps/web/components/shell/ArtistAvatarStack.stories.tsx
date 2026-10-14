import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArtistAvatarStack } from './ArtistAvatarStack';

const artists = [
  { id: 'sasha', displayName: 'Sasha Waves' },
  {
    id: 'tim',
    displayName: 'Tim White',
    avatarUrl: '/avatars/default-user.png',
  },
  { id: 'alex', displayName: 'Alex Rivera' },
];
const meta = {
  title: 'Shell/ArtistAvatarStack',
  component: ArtistAvatarStack,
  parameters: { layout: 'centered' },
  args: { artists },
} satisfies Meta<typeof ArtistAvatarStack>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Overflow: Story = {};
export const SingleFallback: Story = { args: { artists: artists.slice(0, 1) } };
export const Empty: Story = { args: { artists: [] } };
