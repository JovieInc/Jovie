import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  CollapsedContent,
  ExpandedContent,
  PillShimmer,
  TrailingContent,
} from './PlatformPill.parts';

/**
 * Rendered states of the PlatformPill sub-components. The default parts
 * live in PlatformPill.parts.stories.tsx.
 */
const meta = {
  title: 'Dashboard/Atoms/PlatformPill.parts/States',
  component: ExpandedContent,
  parameters: { layout: 'centered' },
  args: { primaryText: 'Spotify' },
} satisfies Meta<typeof ExpandedContent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: collapsed trailing slot and a hidden shimmer render nothing. */
export const EmptyTrailingAndShimmer: Story = {
  render: function EmptyTrailingAndShimmerStory() {
    return (
      <div className='relative flex h-8 w-40 items-center rounded-full border border-subtle p-1'>
        <PillShimmer show={false} />
        <span className='text-xs text-secondary-token'>Spotify</span>
        <TrailingContent collapsed>
          <span className='text-xs text-tertiary-token'>2.3M</span>
        </TrailingContent>
      </div>
    );
  },
};

/** Partial: primary text only, with no secondary line, badge or suffix. */
export const PartialPrimaryOnly: Story = {
  args: { primaryText: 'Spotify' },
  render: function PartialPrimaryOnlyStory(args) {
    return (
      <div className='w-56 rounded-full border border-subtle p-1'>
        <ExpandedContent {...args} />
      </div>
    );
  },
};

/** Long content: primary and secondary text past the 40-character truncation. */
export const LongContentTruncated: Story = {
  args: {
    primaryText: 'The Extremely Long Official Artist Name Of This Profile',
    secondaryText: 'open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb?si=share',
    badgeText: 'New',
    suffix: '↗',
  },
  render: function LongContentTruncatedStory(args) {
    return (
      <div className='w-56 rounded-full border border-subtle p-1'>
        <ExpandedContent {...args} />
      </div>
    );
  },
};

/** Right-to-left: Arabic primary text inside a collapsed pill in an RTL document. */
export const RtlArabic: Story = {
  args: { primaryText: 'سبوتيفاي', secondaryText: 'الفنان الرسمي' },
  render: function RtlArabicStory(args) {
    return (
      <div
        dir='rtl'
        className='group/pill flex w-56 flex-col gap-2 rounded-full border border-subtle p-1'
      >
        <ExpandedContent {...args} />
        <CollapsedContent defaultExpanded primaryText={args.primaryText} />
      </div>
    );
  },
};
