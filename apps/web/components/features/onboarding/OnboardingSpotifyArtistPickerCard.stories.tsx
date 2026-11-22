import '../../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingSpotifyArtistPickerCard } from './OnboardingSpotifyArtistPickerCard';

const meta = {
  title: 'Features/Onboarding/OnboardingSpotifyArtistPickerCard',
  component: OnboardingSpotifyArtistPickerCard,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['disabled'] },
  },
  args: { onSelectArtist: () => {} },
  decorators: [
    Story => (
      <div style={{ width: 640, padding: 24 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OnboardingSpotifyArtistPickerCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  args: { state: 'input-streaming', inputQuery: 'Alex Example' },
};

export const Empty: Story = {
  args: {
    state: 'output-available',
    output: { action: 'open_artist_picker', query: null },
  },
};

export const ErrorState: Story = {
  args: { state: 'output-error' },
};

export const LongContent: Story = {
  args: {
    state: 'output-available',
    output: {
      action: 'open_artist_picker',
      query:
        'An Artist With An Exceptionally Long Name That Wraps Past One Line',
    },
  },
};

export const Partial: Story = {
  args: {
    state: 'input-available',
    inputQuery: 'Alex',
    output: null,
  },
};

export const Offline: Story = {
  args: { state: 'output-error', inputQuery: 'Alex Example' },
};

export const PermissionDenied: Story = {
  args: { state: 'output-denied' },
};

export const Rtl: Story = {
  args: {
    state: 'output-available',
    output: { action: 'open_artist_picker', query: null },
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
