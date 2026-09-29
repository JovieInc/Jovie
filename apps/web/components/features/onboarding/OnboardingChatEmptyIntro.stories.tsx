import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingChatEmptyIntro } from './OnboardingChatEmptyIntro';

const meta: Meta<typeof OnboardingChatEmptyIntro> = {
  title: 'Onboarding/Public Start Entry',
  component: OnboardingChatEmptyIntro,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='flex min-h-screen items-center bg-surface-1 px-4 py-8 [color-scheme:dark]'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const BlankEntry: Story = {
  args: {
    mode: 'blank',
  },
};

export const SpotifyHandoff: Story = {
  args: {
    mode: 'spotify_handoff',
  },
};

export const RestoringStoredIntent: Story = {
  args: {
    mode: 'restoring_intent',
  },
};
