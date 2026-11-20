import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingChatEmptyIntro } from './OnboardingChatEmptyIntro';

const meta: Meta<typeof OnboardingChatEmptyIntro> = {
  title: 'Onboarding/Public Start Entry',
  component: OnboardingChatEmptyIntro,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='flex min-h-screen items-center bg-surface-1 px-4 py-8 [color-scheme:dark]'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const BlankEntry: Story = {
  args: {
    mode: 'blank',
  },
};

export const SpotifyHandoff: Story = {
  args: {
    mode: 'spotify_handoff',
  },
};

export const RestoringStoredIntent: Story = {
  args: {
    mode: 'restoring_intent',
  },
};

/** A prebuilt page with no public links found yet: no link row. */
export const EmptyNoLinksFound: Story = {
  args: {
    mode: 'handle_entry',
    entryProfile: {
      status: 'claimable',
      handle: 'newartist',
      displayName: 'New Artist',
      avatarUrl: null,
      spotifyId: null,
      spotifyUrl: null,
      genres: [],
      socialLinks: [],
      linkPlatforms: [],
      linkCount: 0,
    },
  },
};

/** A prebuilt page with no photo and a single link: the avatar falls back. */
export const PartialNoPhotoOneLink: Story = {
  args: {
    mode: 'handle_entry',
    entryProfile: {
      status: 'claimable',
      handle: 'megaran',
      displayName: 'Mega Ran',
      avatarUrl: null,
      spotifyId: null,
      spotifyUrl: null,
      genres: [],
      socialLinks: ['https://instagram.com/megaran'],
      linkPlatforms: ['instagram'],
      linkCount: 1,
    },
  },
};

/** Long name and handle truncate; the icon row caps at six platforms. */
export const LongContentNameAndLinks: Story = {
  args: {
    mode: 'handle_entry',
    entryProfile: {
      status: 'claimable',
      handle: 'theextraordinarilylongartistnamethatkeepsgoing',
      displayName: 'The Extraordinarily Long Artist Name That Keeps Going',
      avatarUrl: null,
      spotifyId: null,
      spotifyUrl: null,
      genres: [],
      socialLinks: [],
      linkPlatforms: [
        'instagram',
        'tiktok',
        'youtube',
        'spotify',
        'soundcloud',
        'twitch',
        'bandcamp',
      ],
      linkCount: 42,
    },
  },
};

/** A taken handle with its next step inside a right-to-left page. */
export const RtlTakenHandle: Story = {
  args: {
    mode: 'handle_entry',
    entryProfile: {
      status: 'claimed',
      handle: 'tim',
      displayName: 'Tim White',
      avatarUrl: null,
    },
    onTryAnotherName: () => undefined,
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
