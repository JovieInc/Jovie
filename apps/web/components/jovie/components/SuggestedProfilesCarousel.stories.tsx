import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { ProfileSuggestion } from '@/app/api/suggestions/route';
import { SuggestedProfilesCarousel } from './SuggestedProfilesCarousel';

const suggestions: ProfileSuggestion[] = [
  {
    id: 'sug-1',
    type: 'dsp_match',
    platform: 'spotify',
    platformLabel: 'Spotify',
    title: 'DJ Example',
    subtitle: 'Spotify artist profile',
    imageUrl: null,
    externalUrl: null,
    confidence: 0.9,
  },
  {
    id: 'sug-2',
    type: 'dsp_match',
    platform: 'apple_music',
    platformLabel: 'Apple Music',
    title: 'Example Artist',
    subtitle: 'Apple Music artist profile',
    imageUrl: null,
    externalUrl: null,
    confidence: 0.6,
  },
];

const meta = {
  title: 'Jovie/Components/SuggestedProfilesCarousel',
  component: SuggestedProfilesCarousel,
  parameters: { layout: 'centered' },
  args: {
    suggestions,
    isLoading: false,
    currentIndex: 0,
    total: suggestions.length,
    next: fn(),
    prev: fn(),
    confirm: fn(),
    reject: fn(),
    isActioning: false,
  },
} satisfies Meta<typeof SuggestedProfilesCarousel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Suggestions: Story = {};

export const Loading: Story = {
  args: { isLoading: true },
};

export const Actioning: Story = {
  args: { isActioning: true },
};

export const ProfileReady: Story = {
  args: {
    suggestions: [
      {
        id: 'profile-ready-1',
        type: 'profile_ready',
        platform: 'jovie',
        platformLabel: 'Jovie',
        title: 'Your profile is live',
        subtitle: '',
        imageUrl: null,
        externalUrl: null,
        confidence: null,
      },
    ],
    total: 1,
    username: 'artist',
    displayName: 'Test Artist',
    avatarUrl: null,
  },
};
