import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { createRef } from 'react';
import { HeroSpotifyResults } from './HeroSpotifyResults';
import { ARTISTS } from './HeroSpotifyResults.stories';

const NOOP = () => {};

const meta = {
  title: 'Marketing/Sections/HeroSpotifyResults/States',
  component: HeroSpotifyResults,
  parameters: { layout: 'centered' },
  args: {
    resultsId: 'hero-spotify-results',
    isEditorial: false,
    results: [],
    state: 'idle',
    isLoading: false,
    isInvalidQuery: false,
    activeIndex: -1,
    pasteUrlIndex: 0,
    totalItems: 1,
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

/** Loading: skeleton rows while the first search is in flight. */
export const LoadingSkeleton: Story = {
  args: { state: 'loading', isLoading: true },
};

/** Empty: the search found no artist, and pasting a link is still offered. */
export const EmptyNoArtists: Story = {
  args: { state: 'empty' },
};

/** Error: the search failed and a retry action is shown. */
export const ErrorSearchFailed: Story = {
  args: { state: 'error' },
};

/** Partial: one artist with no image or follower count. */
export const PartialSparseArtist: Story = {
  args: {
    state: 'success',
    results: [
      {
        id: 'sparse',
        name: 'New Artist',
        popularity: 1,
        url: 'https://open.spotify.com/artist/sparse',
      },
    ],
    pasteUrlIndex: 1,
    totalItems: 2,
  },
};

/** Long content: a very long artist name truncates in its row. */
export const LongContentName: Story = {
  args: {
    state: 'success',
    results: [
      {
        ...ARTISTS[0],
        name: 'An Artist Whose Name Is Far Too Long To Fit In A Single Row Of Results',
      },
    ],
    pasteUrlIndex: 1,
    totalItems: 2,
  },
};

/** Offline: the same failure state a dropped connection produces. */
export const OfflineSearchFailed: Story = {
  args: { state: 'error' },
};

/** Permission denied: an invalid query asks for a name or a Spotify link. */
export const PermissionDeniedInvalidQuery: Story = {
  args: { isInvalidQuery: true },
};

/** Right to left: the dropdown under an Arabic document direction. */
export const RtlOverflow: Story = {
  args: { state: 'success', results: ARTISTS, pasteUrlIndex: 2, totalItems: 3 },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar' className='relative h-96 w-120'>
          <Story />
        </div>
      );
    },
  ],
};
