import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingChatEmptyIntro } from './OnboardingChatEmptyIntro';

function ComposerFixture() {
  return (
    <div className='flex min-h-14 w-full items-center rounded-2xl border border-subtle bg-surface-0 px-4 text-sm text-secondary-token shadow-card'>
      Artist, release, or link...
    </div>
  );
}

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
  args: {
    composer: <ComposerFixture />,
    onSelectSuggestion: () => undefined,
  },
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
