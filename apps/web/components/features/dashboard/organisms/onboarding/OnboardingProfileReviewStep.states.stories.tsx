import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
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
  title: 'Dashboard/Organisms/Onboarding/OnboardingProfileReviewStep/States',
  component: OnboardingProfileReviewStep,
  parameters: { layout: 'fullscreen' },
  decorators: [withDashboardProviders],
  args: {
    title: 'Review your profile',
    prompt: "Here's what fans will see first.",
    enrichedProfile,
    handle: 'sashawaves',
    onGoToDashboard: () => {},
    isEnriching: false,
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

/** Loading: enrichment is still running, so the progress bar shows. */
export const LoadingEnriching: Story = {
  args: { enrichedProfile: null, isEnriching: true, isStepResume: false },
};

/** Empty: no bio, genres or photo came back from enrichment. */
export const EmptyNoEnrichment: Story = {
  args: {
    enrichedProfile: { name: 'Sasha Waves', followers: 0 },
    existingAvatarUrl: null,
  },
};

/** Error: clearing the display name shows the validation message. */
export const ErrorNameRequired: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Edit name' }));
    const input = canvas.getByRole('textbox', { name: 'Edit Display Name' });
    await userEvent.clear(input);
    await userEvent.tab();
    await expect(
      await canvas.findByText('Display name is required')
    ).toBeVisible();
  },
};

/** Partial: the photo is low resolution, so a notice suggests a sharper one. */
export const PartialLowQualityPhoto: Story = {
  args: {
    avatarQuality: { status: 'low', width: 200, height: 200 },
  },
};

/** Long content: a long name, bio and genre list truncate inside the card. */
export const LongContentProfile: Story = {
  args: {
    enrichedProfile: {
      ...enrichedProfile,
      name: 'Alexander Bartholomew Montgomery Featherstonehaugh The Third',
      bio: 'Independent artist making dream-pop from a home studio, mixing field recordings, modular synths and tape loops into long form records that people play from the first track to the last, then again.',
      genres: ['dream pop', 'indie', 'shoegaze', 'ambient'],
    },
  },
};

/** Right to left: the card mirrors under an Arabic document direction. */
export const RtlOverflow: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
