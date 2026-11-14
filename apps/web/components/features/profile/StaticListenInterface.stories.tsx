import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useLayoutEffect } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { LISTEN_COOKIE } from '@/constants/app';
import type { AvailableDSP } from '@/lib/dsp';
import { toGenericPlatformLink } from '@/lib/platform-links';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';
import { StaticListenInterface } from './StaticListenInterface';

const storyDsps = [
  {
    key: 'spotify',
    name: 'Spotify',
    url: 'https://open.spotify.com/artist/4u',
    config: {
      name: 'Spotify',
      color: '#1DB954',
      textColor: '#FFFFFF',
      logoSvg: '<svg />',
    },
  },
  {
    key: 'apple_music',
    name: 'Apple Music',
    url: 'https://music.apple.com/artist/4u',
    config: {
      name: 'Apple Music',
      color: '#FA243C',
      textColor: '#FFFFFF',
      logoSvg: '<svg />',
    },
  },
] satisfies AvailableDSP[];

const meta = {
  title: 'Profile/StaticListenInterface',
  component: StaticListenInterface,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    jovie: {
      uncoveredProps: [
        'enableDynamicEngagement',
        'containerClassName',
        'emptyStateClassName',
        'providerButtonClassName',
        'helpTextClassName',
        'hideHelpText',
      ],
    },
  },
  args: {
    artist: PROFILE_STORY_ARTIST,
    handle: 'timwhite',
    dspsOverride: storyDsps,
    renderMode: 'interactive',
  },
} satisfies Meta<typeof StaticListenInterface>;

export default meta;

export const ListenLinks: StoryObj<typeof meta> = {};

export const PreviewRows: StoryObj<typeof meta> = {
  args: { renderMode: 'preview' },
};

type Story = StoryObj<typeof meta>;

function genericLink(label: string, url: string): AvailableDSP {
  const link = toGenericPlatformLink(label, url);
  if (!link) throw new Error(`Story link fixture is invalid: ${url}`);
  return link;
}

const officialStore = genericLink(
  'Official Store',
  'https://store.example.com/timwhite'
);

/**
 * Clicking a provider opens its URL in a new tab and remembers the choice.
 * The story stubs window.open so nothing is opened or fetched, and puts the
 * listen preference cookie and storage back on unmount.
 */
function NoNavigation({ children }: { readonly children: ReactNode }) {
  useLayoutEffect(() => {
    const originalOpen = globalThis.open;
    let storedPreference: string | null = null;
    try {
      storedPreference = localStorage.getItem(LISTEN_COOKIE);
    } catch {
      // Storage can be unavailable in story extraction.
    }
    globalThis.open = () => null;
    return () => {
      globalThis.open = originalOpen;
      document.cookie = `${LISTEN_COOKIE}=; path=/; max-age=0`;
      try {
        if (storedPreference === null) localStorage.removeItem(LISTEN_COOKIE);
        else localStorage.setItem(LISTEN_COOKIE, storedPreference);
      } catch {
        // Storage can be unavailable in story extraction.
      }
    };
  }, []);

  return <>{children}</>;
}

/**
 * The row shows "Opening …" and locks every provider for about a second after
 * a press. The pressed link is a generic one with no app deep link, so the
 * click only reaches the stubbed window.open.
 */
export const LoadingOpeningProvider: Story = {
  args: { dspsOverride: [officialStore, ...storyDsps] },
  decorators: [
    Story => (
      <NoNavigation>
        <Story />
      </NoNavigation>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('link', { name: 'Listen on Official Store' })
    );
    await expect(
      await canvas.findByText('Opening Official Store...')
    ).toBeVisible();
  },
};

export const EmptyNoProviders: Story = {
  args: { dspsOverride: [] },
};

/** Only one provider is connected, and the caller hides the help text. */
export const PartialSingleProvider: Story = {
  args: { dspsOverride: [storyDsps[0]], hideHelpText: true },
};

export const LongContentManyProviders: Story = {
  args: {
    dspsOverride: [
      ...storyDsps,
      genericLink(
        'Extended Club Mixes and Unreleased Edits Archive',
        'https://archive.example.com/timwhite/extended-club-mixes'
      ),
      genericLink(
        'Independent Record Store Day Exclusive Vinyl Pressings',
        'https://vinyl.example.com/timwhite'
      ),
      officialStore,
    ],
  },
  render: args => (
    <div className='w-72'>
      <StaticListenInterface {...args} />
    </div>
  ),
};

export const RtlProviders: Story = {
  args: {
    dspsOverride: [
      ...storyDsps,
      genericLink('المتجر الرسمي', 'https://store.example.com/timwhite'),
    ],
  },
  render: args => (
    <div dir='rtl' className='w-80'>
      <StaticListenInterface {...args} />
    </div>
  ),
};
