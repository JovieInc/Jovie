import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeProfileShowcase } from './HomeProfileShowcase';

const meta = {
  title: 'Features/Home/HomeProfileShowcase States',
  component: HomeProfileShowcase,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HomeProfileShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the Events tab of a profile with no tour dates, release or playlist. */
export const EmptyEvents: Story = {
  args: { stateId: 'events-empty' },
};

/** Partial: no release or tour, so the profile falls back to a playlist. */
export const PartialPlaylistFallback: Story = {
  args: { stateId: 'playlist-fallback' },
};

/** Partial: only the Apple Pay overlay card, without the phone surface. */
export const PartialOverlayOnly: Story = {
  args: {
    stateId: 'tips-apple-pay',
    presentation: 'surface-card',
    overlayMode: 'only',
  },
};

/** Rtl: the showcase in a right-to-left document. */
export const Rtl: Story = {
  args: { stateId: 'streams-latest' },
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
