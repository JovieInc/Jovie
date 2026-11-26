import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { createRef } from 'react';
import type { SpotifyArtistResult } from '@/lib/queries';
import { HeroSpotifyResults } from './HeroSpotifyResults';

const NOOP = () => {};

export const ARTISTS: SpotifyArtistResult[] = [
  {
    id: 'artist-1',
    name: 'Taylor Swift',
    followers: 120_000_000,
    popularity: 100,
    url: 'https://open.spotify.com/artist/artist-1',
    verified: true,
  },
  {
    id: 'artist-2',
    name: 'Taylor Dayne',
    followers: 450_000,
    popularity: 60,
    url: 'https://open.spotify.com/artist/artist-2',
    isClaimed: true,
  },
];

const meta = {
  title: 'Marketing/Sections/HeroSpotifyResults',
  component: HeroSpotifyResults,
  parameters: { layout: 'centered' },
  args: {
    resultsId: 'hero-spotify-results',
    isEditorial: false,
    results: ARTISTS,
    state: 'success',
    isLoading: false,
    isInvalidQuery: false,
    activeIndex: -1,
    pasteUrlIndex: ARTISTS.length,
    totalItems: ARTISTS.length + 1,
    resultsListRef: createRef<HTMLDivElement>(),
    onActiveIndexChange: NOOP,
    onSelectArtist: NOOP,
    onPasteUrl: NOOP,
    onRetry: NOOP,
  },
  decorators: [
    function FrameDecorator(Story) {
      return (
        <div className='relative h-96 w-120'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof HeroSpotifyResults>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Results: Story = {};

export const ActiveResult: Story = {
  args: { activeIndex: 1 },
};
