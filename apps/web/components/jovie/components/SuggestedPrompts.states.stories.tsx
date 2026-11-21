import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SuggestedPrompts } from './SuggestedPrompts';

const meta = {
  title: 'Jovie/SuggestedPrompts/States',
  component: SuggestedPrompts,
  args: { onSelect: fn(), canUseAdvancedTools: true },
  decorators: [
    function PromptsFrame(Story) {
      return (
        <div className='w-full max-w-3xl'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof SuggestedPrompts>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: album art availability is still being checked, so its pill is disabled. */
export const LoadingAlbumArtCheck: Story = {
  args: {
    albumArtCapability: {
      availability: 'unknown',
      reason: 'Checking album art availability...',
      reasonCode: 'CHECKING',
    },
  },
};

/** Partial: only the featured skills are offered. */
export const PartialFeaturedOnly: Story = { args: { featuredOnly: true } };

/** Long content: a long release title is carried into the pitch pill. */
export const LongContentReleaseTitle: Story = {
  args: {
    latestReleaseTitle:
      'Midnight Drive (Extended Club Mix featuring a very long list of guest artists)',
  },
  decorators: [
    function NarrowFrame(Story) {
      return (
        <div className='w-80'>
          <Story />
        </div>
      );
    },
  ],
};

/** Permission denied: a plan-gated capability leaves its pill disabled. */
export const PermissionDeniedPlanGated: Story = {
  args: {
    albumArtCapability: {
      availability: 'unavailable',
      reason: 'Album art needs a Pro plan.',
      reasonCode: 'PLAN_UNAVAILABLE',
    },
  },
};

/** Rtl: the pills wrap from the inline start in a right-to-left layout. */
export const RtlRail: Story = {
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' className='w-full max-w-3xl'>
          <Story />
        </div>
      );
    },
  ],
};
