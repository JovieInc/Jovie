import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Link2, MapPin } from 'lucide-react';
import { AnalyticsRankedList } from './AnalyticsRankedList';

/**
 * State coverage for the analytics ranked list. Same frame and base args as
 * the canonical stories; each state changes only the ranked rows or the
 * document direction.
 */
const meta = {
  title: 'Dashboard/Organisms/AnalyticsRankedList States',
  component: AnalyticsRankedList,
  parameters: {
    layout: 'centered',
  },
  args: {
    icon: MapPin,
    loading: false,
    emptyMessage: 'No city data yet',
    items: [
      { key: 'la', label: 'Los Angeles', value: '412' },
      { key: 'nyc', label: 'New York', value: '268' },
    ],
  },
  decorators: [
    Story => (
      <div className='max-w-full' style={{ width: 340 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AnalyticsRankedList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: fewer than five ranked rows keeps the card at its fixed height. */
export const PartialTwoRows: Story = {};

/** Long content: long link labels truncate and large counts stay aligned. */
export const LongContentLabels: Story = {
  args: {
    icon: Link2,
    emptyMessage: 'No link data yet',
    items: [
      {
        key: 'a',
        label:
          'https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy?si=release-day-campaign',
        value: '1,284,903',
      },
      {
        key: 'b',
        label: 'https://music.apple.com/us/album/the-midnight-harbour-sessions',
        value: '904,117',
      },
      { key: 'c', label: 'https://youtube.com/watch?v=dQw4w9WgXcQ', value: '88,210' },
      { key: 'd', label: 'https://tidal.com/browse/album/123456789', value: '7,402' },
      { key: 'e', label: '100%25%20pure%20remix', value: '12' },
    ],
  },
};

/** Right-to-left: Arabic city names inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    items: [
      { key: 'cai', label: 'القاهرة', value: '412' },
      { key: 'dxb', label: 'دبي', value: '268' },
      { key: 'ruh', label: 'الرياض', value: '131' },
    ],
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
