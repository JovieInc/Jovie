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

/** No social links: the Listen pill takes the whole action row. */
export const EmptySocialLinks: StoryObj<typeof meta> = {
  args: { socialLinks: [] },
};

/** No portrait, not verified and nowhere to listen yet: the initials
 *  fallback, name and handle only. */
export const PartialNoPortrait: StoryObj<typeof meta> = {
  args: {
    imageUrl: null,
    isVerified: false,
    hasListenDestination: false,
    socialLinks: [],
  },
};

/** A long name and handle truncate inside the column. */
export const LongContentName: StoryObj<typeof meta> = {
  args: {
    name: 'Tim White and the Los Angeles After Hours Orchestra',
    handle: 'timwhiteandthelosangelesafterhoursorchestra',
    onGetUpdatesClick: fn(),
  },
};

/** Portrait, name and action row inside a right-to-left page. */
export const Rtl: StoryObj<typeof meta> = {
  args: { name: 'تيم وايت', onGetUpdatesClick: fn() },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
