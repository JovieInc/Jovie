import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingSpotifyArtistPickerCard } from './OnboardingToolArtifacts';

const meta = {
  title: 'Features/Onboarding/OnboardingToolArtifacts',
  component: OnboardingSpotifyArtistPickerCard,
  parameters: {
    layout: 'centered',
  },
  args: {
    onSelectArtist: () => {},
  },
} satisfies Meta<typeof OnboardingSpotifyArtistPickerCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// Early states only — avoids the live artist-search network query.
export const Searching: Story = {
  args: {
    state: 'input-streaming',
  },
};

export const SearchFailed: Story = {
  args: {
    state: 'output-error',
  },
};
