import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChannelIntelligencePanel } from './ChannelIntelligencePanel';
import { channelReport, rankedVideo } from './channel-intelligence-fixtures';

/**
 * Rendered states of the channel intelligence panel. The connected and
 * not-connected renders live in ChannelIntelligencePanel.stories.tsx.
 */
const meta = {
  title: 'Dashboard/Youtube/ChannelIntelligencePanel/States',
  component: ChannelIntelligencePanel,
  args: { report: null, isConnected: true },
  parameters: { jovie: { uncoveredProps: ['video'] } },
} satisfies Meta<typeof ChannelIntelligencePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: connected, but the Reporting API has no metrics yet. */
export const EmptyNoMetrics: Story = {
  args: { report: channelReport([]) },
};

/** Partial: ranked and declining videos, with no win signals or sources. */
export const PartialNoSignals: Story = {
  args: {
    report: channelReport(
      [rankedVideo(1, 'Behind The Scenes: Studio Session')],
      [rankedVideo(2, 'Untitled Draft Upload')]
    ),
  },
};

/** Long content: long titles and a full ranked list. */
export const LongContentRankedList: Story = {
  args: {
    report: channelReport(
      Array.from({ length: 8 }, (_, index) =>
        rankedVideo(
          index + 1,
          `Live At The Warehouse: The Complete Four Hour Closing Set With Every Unreleased Edit, Part ${index + 1}`
        )
      )
    ),
  },
};

/** Right-to-left: Arabic video titles in an Arabic document direction. */
export const RtlArabicTitles: Story = {
  args: {
    report: channelReport([
      rankedVideo(1, 'خلف الكواليس: جلسة الاستوديو'),
      rankedVideo(2, 'عرض مباشر من المستودع'),
    ]),
  },
  decorators: [
    function RtlDirection(StoryComponent) {
      return (
        <div dir='rtl' lang='ar'>
          <StoryComponent />
        </div>
      );
    },
  ],
};
