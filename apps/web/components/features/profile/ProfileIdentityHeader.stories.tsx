import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ProfileIdentityHeader } from './ProfileIdentityHeader';

const meta = {
  title: 'Profile/ProfileIdentityHeader',
  component: ProfileIdentityHeader,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='profile-viewport w-sm max-w-full bg-(--profile-stage-bg) p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    name: 'Tim White',
    handle: 'tim',
    imageUrl: '/images/avatars/tim-white.jpg',
    isVerified: true,
    profileHref: '/tim',
    listenHref: '/tim/listen',
    isListenActive: false,
    onListenClick: fn(),
    onSocialClick: fn(),
    headingAs: 'h1',
    headingTestId: 'profile-header',
    imagePriority: true,
    className: undefined,
    socialLinks: [
      {
        id: 'instagram',
        artist_id: 'story-artist',
        platform: 'instagram',
        url: 'https://instagram.com/timwhite',
        clicks: 0,
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'tiktok',
        artist_id: 'story-artist',
        platform: 'tiktok',
        url: 'https://www.tiktok.com/@timwhite',
        clicks: 0,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  },
} satisfies Meta<typeof ProfileIdentityHeader>;

export default meta;
export const Verified: StoryObj<typeof meta> = {};

export const GetUpdates: StoryObj<typeof meta> = {
  args: { onGetUpdatesClick: fn() },
};

export const UpdatesOn: StoryObj<typeof meta> = {
  args: { onGetUpdatesClick: fn(), isSubscribed: true },
};
