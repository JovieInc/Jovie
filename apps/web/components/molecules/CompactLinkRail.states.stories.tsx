import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { CompactLinkRailItem } from './CompactLinkRail';
import { CompactLinkRail } from './CompactLinkRail';

const item = (
  id: string,
  platformName: string,
  primaryText: string
): CompactLinkRailItem => ({
  id,
  platformIcon: id,
  platformName,
  primaryText,
  onClick: fn(),
});

/** Rendered states of the compact link rail, beside CompactLinkRail.stories.tsx. */
const meta = {
  title: 'Molecules/CompactLinkRail States',
  component: CompactLinkRail,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-64 bg-surface-1 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    items: [item('instagram', 'Instagram', '12.4k')],
    countLabel: 'platforms',
  },
} satisfies Meta<typeof CompactLinkRail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: one link with no click handler and no summary count. */
export const PartialSingleStaticLink: Story = {
  args: {
    items: [
      {
        id: 'spotify',
        platformIcon: 'spotify',
        platformName: 'Spotify',
        primaryText: '8.1k',
      },
    ],
  },
};

/** Long content: many links collapse into the summary pill and three pills. */
export const ManyLinksCollapsed: Story = {
  args: {
    items: [
      item('instagram', 'Instagram', '12.4k'),
      item('spotify', 'Spotify', '8.1k'),
      item('youtube', 'YouTube', '3.2k'),
      item('tiktok', 'TikTok', '2.9k'),
      item('soundcloud', 'SoundCloud', '1.1k'),
      item('twitter', 'X', '940'),
    ],
    summaryCount: 6,
    summaryAriaLabel: '6 connected platforms',
  },
};

/** Right-to-left: the rail on a right-to-left page with an Arabic count label. */
export const RtlArabicRail: Story = {
  args: {
    items: [
      item('instagram', 'Instagram', '12.4k'),
      item('spotify', 'Spotify', '8.1k'),
    ],
    countLabel: 'منصات',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-64 bg-surface-1 p-3'>
        <Story />
      </div>
    ),
  ],
};
