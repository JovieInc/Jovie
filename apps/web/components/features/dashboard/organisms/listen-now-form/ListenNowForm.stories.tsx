import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { ListenNowFormView } from './ListenNowForm';

const meta = {
  title: 'Dashboard/Organisms/ListenNowForm',
  component: ListenNowFormView,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-full max-w-2xl'>
        <Story />
      </div>
    ),
  ],
  args: {
    primaryFields: {
      spotifyUrl: 'https://open.spotify.com/artist/story',
      appleMusicUrl: '',
      youtubeUrl: 'https://youtube.com/@minavale',
    },
    additionalLinks: [
      { id: 'sc', platform: 'soundcloud', url: 'https://soundcloud.com/mina' },
    ],
    connectedDspInfo: {},
    updatePrimaryField: fn(),
    schedulePrimaryNormalize: fn(),
    handlePrimaryBlur: fn(),
    addAdditionalLink: fn(),
    removeAdditionalLink: fn(),
    updateAdditionalLink: fn(),
    scheduleAdditionalNormalize: fn(),
    handleAdditionalBlur: fn(),
    handleSubmit: fn(),
    loading: false,
    initialLoading: false,
    error: undefined,
    success: false,
    isDarkTheme: false,
  },
} satisfies Meta<typeof ListenNowFormView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: { initialLoading: true },
};

export const Empty: Story = {
  args: {
    primaryFields: { spotifyUrl: '', appleMusicUrl: '', youtubeUrl: '' },
    additionalLinks: [],
  },
};

export const Error: Story = {
  args: { error: 'Could not save your music links. Try again.' },
};

/** Partial: Spotify is matched to an artist, Apple Music is still empty. */
export const Partial: Story = {
  args: {
    connectedDspInfo: {
      spotify: {
        artistName: 'Mina Vale',
        artistImageUrl: null,
        externalUrl: 'https://open.spotify.com/artist/story',
      },
    },
    success: true,
  },
};

export const LongContent: Story = {
  args: {
    primaryFields: {
      spotifyUrl: `https://open.spotify.com/artist/${'a'.repeat(120)}`,
      appleMusicUrl: '',
      youtubeUrl: '',
    },
    connectedDspInfo: {
      spotify: {
        artistName: 'Mina Vale and the Extraordinarily Long Named Ensemble',
        artistImageUrl: null,
        externalUrl: null,
      },
    },
  },
};

/** Offline: the save failed because the network is unreachable. */
export const Offline: Story = {
  args: { error: 'You appear to be offline. Check your connection.' },
};

export const RtlOverflow: Story = {
  decorators: [
    function Rtl(Story: () => ReactNode) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
