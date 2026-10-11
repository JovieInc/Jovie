import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { withDashboardProviders } from '@/.storybook/dashboard-fixtures';
import type { EnrichedProfileData } from '@/app/onboarding/actions/enrich-profile';
import { OnboardingProfileReviewStep } from './OnboardingProfileReviewStep';

const enrichedProfile: EnrichedProfileData = {
  name: 'Sasha Waves',
  imageUrl: 'https://placehold.co/256x256',
  bio: 'Independent artist making dream-pop from a home studio.',
  genres: ['dream pop', 'indie'],
  followers: 4200,
};

const meta = {
  title: 'Dashboard/Organisms/Onboarding/OnboardingProfileReviewStep',
  component: OnboardingProfileReviewStep,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withDashboardProviders],
  args: {
    title: 'Review your profile',
    prompt: "Here's what fans will see first.",
    enrichedProfile,
    handle: 'sashawaves',
    onGoToDashboard: () => {},
    isEnriching: false,
    // Step-resume disables the avatar-polling network query and the
    // review-delay timer so the story renders its final state immediately.
    isStepResume: true,
  },
  render: args => (
    <div className='min-h-screen bg-base'>
      <OnboardingProfileReviewStep {...args} />
    </div>
  ),
} satisfies Meta<typeof OnboardingProfileReviewStep>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Enriched: Story = {};

export const Enriching: Story = {
  args: {
    enrichedProfile: null,
    isEnriching: true,
    isStepResume: false,
  },
};

export const NoPhotoYet: Story = {
  args: {
    enrichedProfile: { ...enrichedProfile, imageUrl: null },
  },
};

export const LowQualityPhoto: Story = {
  args: {
    avatarQuality: { status: 'low', width: 96, height: 96 },
  },
};
