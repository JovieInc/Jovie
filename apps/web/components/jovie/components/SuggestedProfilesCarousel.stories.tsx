import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { ProfileSuggestion } from '@/app/api/suggestions/route';
import { SuggestedProfilesCarousel } from './SuggestedProfilesCarousel';

const profileReadySuggestion: ProfileSuggestion = {
  id: 'profile-ready-1',
  type: 'profile_ready',
  platform: 'jovie',
  platformLabel: 'Jovie',
  title: 'Your profile is live',
  subtitle: '',
  imageUrl: null,
  externalUrl: null,
  confidence: null,
};

const dspMatchSuggestion: ProfileSuggestion = {
  id: 'dsp-match-1',
  type: 'dsp_match',
  platform: 'spotify',
  platformLabel: 'Spotify',
  title: 'Test Artist',
  subtitle: '@testartist',
  imageUrl: null,
  externalUrl: 'https://open.spotify.com/artist/test',
  confidence: 0.9,
};

const meta = {
  title: 'Jovie/Components/SuggestedProfilesCarousel',
  component: SuggestedProfilesCarousel,
  parameters: {
    layout: 'centered',
    // isActioning (exercised by ActioningInFlight below) drives Tailwind
    // `disabled:` states on the action buttons; there is no `disabled` prop.
    jovie: { uncoveredProps: ['disabled'] },
  },
  args: {
    isLoading: false,
    currentIndex: 0,
    total: 1,
    next: fn(),
    prev: fn(),
    confirm: fn(),
    reject: fn(),
    isActioning: false,
    username: 'artist',
    displayName: 'Test Artist',
    avatarUrl: null,
  },
} satisfies Meta<typeof SuggestedProfilesCarousel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ProfileReady: Story = {
  args: { suggestions: [profileReadySuggestion] },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Dismiss' }));
    await expect(args.reject).toHaveBeenCalledTimes(1);
  },
};

export const DspMatch: Story = {
  args: { suggestions: [dspMatchSuggestion] },
};

export const ActioningInFlight: Story = {
  args: { suggestions: [profileReadySuggestion], isActioning: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Dismiss' })
    ).toBeDisabled();
  },
};

export const Empty: Story = { args: { suggestions: [], total: 0 } };
