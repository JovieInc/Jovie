import '../../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { PROFILE_CHAT_FOLLOW_UPS } from '../profile-chat-follow-ups';
import { ChatFollowUps } from './ChatFollowUps';

const meta = {
  title: 'Chat/FollowUps',
  component: ChatFollowUps,
  parameters: { layout: 'fullscreen' },
  args: { items: PROFILE_CHAT_FOLLOW_UPS, onSelect: fn() },
  decorators: [
    Story => (
      <div className='bg-base p-6'>
        <div className='w-full max-w-2xl'>
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ChatFollowUps>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Next moves under the first reply of a chat opened from your own profile. */
export const ProfileNextMoves: Story = {};

export const ProfileNextMovesLight: Story = {
  parameters: { themes: { themeOverride: 'light' } },
};
