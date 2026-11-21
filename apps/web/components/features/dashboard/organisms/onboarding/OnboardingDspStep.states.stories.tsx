import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingDspStep } from './OnboardingDspStep';

const NOOP = () => {};

const meta = {
  title: 'Features/Dashboard/Organisms/Onboarding/OnboardingDspStep/States',
  component: OnboardingDspStep,
  parameters: { layout: 'centered' },
  args: {
    title: 'Are you on Spotify?',
    prompt:
      'Connect Spotify so we can pull in your releases, artwork, and DSP links automatically.',
    isTransitioning: false,
    onConnected: NOOP,
    onSkip: NOOP,
  },
} satisfies Meta<typeof OnboardingDspStep>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the step is moving on, so the skip button is disabled. */
export const LoadingTransitioning: Story = {
  args: { isTransitioning: true },
};

/** Empty: no query yet, only the search field and the skip action show. */
export const EmptySearch: Story = {};

/** Long content: a long title and prompt wrap above the card. */
export const LongContentPrompt: Story = {
  args: {
    title: 'Connect the streaming profile that holds your whole catalog',
    prompt:
      'Connect Spotify so we can pull in every release, piece of artwork, and DSP link automatically, then keep them in sync as you publish new music.',
  },
};

/** Right to left: the step mirrors under an Arabic document direction. */
export const RtlOverflow: Story = {
  args: { title: 'هل أنت على سبوتيفاي؟' },
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
