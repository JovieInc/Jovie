import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { createStepContext } from './fixtures/onboardingV2StepContext';
import {
  OnboardingV2SpotifySearchField,
  OnboardingV2StepContent,
} from './OnboardingV2Steps';

const meta = {
  title: 'Features/Dashboard/Onboarding/OnboardingV2Steps',
  component: OnboardingV2StepContent,
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } },
  args: { ctx: createStepContext({ currentStep: 'spotify' }) },
} satisfies Meta<typeof OnboardingV2StepContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SpotifySearch: Story = {};

export const ArtistConfirm: Story = {
  args: { ctx: createStepContext({ currentStep: 'artist-confirm' }) },
};

export const Upgrade: Story = {
  args: { ctx: createStepContext({ currentStep: 'upgrade' }) },
};

export const ProfileReady: Story = {
  args: { ctx: createStepContext({ currentStep: 'profile-ready' }) },
};

export const SearchFieldLoading: Story = {
  render: () => (
    <div className='w-96 p-4'>
      <OnboardingV2SpotifySearchField
        isLoading
        onInput={() => {}}
        onSelectArtist={() => {}}
        results={[]}
        value='Avery'
      />
    </div>
  ),
};
