import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { ArtistSelectionFormView } from './ArtistSelectionForm';
import type { SearchResult, UseArtistSelectionFormReturn } from './types';

const artist: SearchResult = {
  id: 'artist-1',
  name: 'Sasha Waves',
  url: 'https://open.spotify.com/artist/artist-1',
  popularity: 62,
};

const noop = () => undefined;

const baseArgs: UseArtistSelectionFormReturn = {
  selectedArtist: null,
  pendingClaim: null,
  state: { loading: false, error: null, retryCount: 0 },
  searchError: null,
  isLoading: false,
  options: [],
  handleArtistSelect: noop,
  handleInputChange: noop,
  handleSubmit: async () => undefined,
  handleSkip: noop,
  retryOperation: noop,
};

const meta = {
  title: 'Features/Dashboard/Organisms/ArtistSelectionForm/ArtistSelectionForm',
  component: ArtistSelectionFormView,
  parameters: {
    layout: 'fullscreen',
  },
  args: baseArgs,
} satisfies Meta<typeof ArtistSelectionFormView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Loading: the artist search is running, and a saved choice is being stored. */
export const LoadingSearch: Story = {
  args: { isLoading: true, state: { ...baseArgs.state, loading: true } },
};

/** Empty: the search found no artists for the typed name. */
export const EmptyNoResults: Story = {
  args: { options: [], searchError: 'No artists found' },
};

/** Error: saving failed, with a retry that is still allowed. */
export const ErrorSaveFailed: Story = {
  args: {
    selectedArtist: artist,
    state: {
      loading: false,
      error: 'Could not save your artist',
      retryCount: 1,
    },
  },
};

/** Partial: a pending claim from Spotify asks the artist to confirm. */
export const PartialPendingClaim: Story = {
  args: {
    pendingClaim: {
      spotifyId: 'artist-1',
      artistName: 'Sasha Waves',
      timestamp: 0,
    },
    options: [{ id: 'artist-1', name: 'Sasha Waves' }],
  },
};

/** Long content: a long artist name truncates in the selected card. */
export const LongContentArtistName: Story = {
  args: {
    selectedArtist: {
      ...artist,
      name: 'Sasha Waves and the Extremely Long Named Touring Collective Orchestra',
    },
  },
};

/** Offline: the search cannot reach Spotify and says so, with retries used up. */
export const OfflineRetriesUsedUp: Story = {
  args: {
    state: {
      loading: false,
      error: 'You appear to be offline',
      retryCount: 3,
    },
  },
};

/** RTL: the form mirrors in a right-to-left document. */
export const RtlForm: Story = {
  args: { selectedArtist: artist },
  decorators: [
    function RtlDecorator(Story: () => ReactNode) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
