import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingDspStep } from './OnboardingDspStep';

const meta = {
  title: 'Features/Dashboard/Organisms/Onboarding/OnboardingDspStep',
  component: OnboardingDspStep,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'title',
        'prompt',
        'isTransitioning',
        'onConnected',
        'onSkip',
        'releases',
        'artistName',
        'spotifyArtistId',
        'spotifyUrl',
        'disabled',
        'isLoading',
      ],
    },
  },
} satisfies Meta<typeof OnboardingDspStep>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    isTransitioning: false,
    onConnected: () => {},
    onSkip: () => {},
    title: 'Connect your music',
  },
};
