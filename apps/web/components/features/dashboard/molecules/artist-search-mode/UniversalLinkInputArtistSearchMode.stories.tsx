import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { UniversalLinkInputArtistSearchModeView } from './UniversalLinkInputArtistSearchMode';

const RESULTS = [
  {
    id: 'a1',
    name: 'Luna Park',
    url: 'https://open.spotify.com/artist/a1',
    imageUrl: '',
    popularity: 70,
    followers: 120400,
    verified: true,
  },
  {
    id: 'a2',
    name: 'Luna Parks',
    url: 'https://open.spotify.com/artist/a2',
    imageUrl: '',
    popularity: 10,
    followers: 880,
    verified: false,
  },
];

const meta = {
  title: 'Features/Dashboard/Molecules/UniversalLinkInputArtistSearchMode',
  component: UniversalLinkInputArtistSearchModeView,
  parameters: { layout: 'centered' },
  decorators: [
    function Frame(Story: () => ReactNode) {
      return (
        <div className='h-72 w-96'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    inputRef: { current: null },
    resultsListRef: { current: null },
    searchQuery: '',
    showResults: false,
    activeResultIndex: -1,
    results: [],
    state: 'idle',
    error: null,
    searchPlatform: undefined,
    brandHex: '#1DB954',
    iconColor: '#ffffff',
    iconBg: 'transparent',
    handleSearchInputChange: fn(),
    handleSearchKeyDown: fn(),
    handleArtistSelect: fn(),
    exitSearchMode: fn(),
    setActiveResultIndex: fn(),
    setShowResults: fn(),
  },
} satisfies Meta<typeof UniversalLinkInputArtistSearchModeView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: { searchQuery: 'luna', showResults: true, state: 'loading' },
};

export const Empty: Story = {
  args: { searchQuery: 'zzzz', showResults: true, state: 'empty' },
};

export const Error: Story = {
  args: {
    searchQuery: 'luna',
    showResults: true,
    state: 'error',
    error: 'Search failed',
  },
};

export const Partial: Story = {
  args: {
    searchQuery: 'luna',
    showResults: true,
    state: 'success',
    results: RESULTS,
    activeResultIndex: 0,
  },
};

export const LongContent: Story = {
  args: {
    searchQuery: 'luna',
    showResults: true,
    state: 'success',
    results: [
      {
        ...RESULTS[0],
        name: 'Luna Park and the Extraordinarily Long Named Orchestral Ensemble',
      },
    ],
  },
};

export const Offline: Story = {
  args: { disabled: true, searchQuery: 'luna' },
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
  args: {
    searchQuery: 'لونا',
    showResults: true,
    state: 'success',
    results: [{ ...RESULTS[0], name: 'لونا بارك' }],
  },
};
