import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { ChatStyleLinkItem } from './ChatStyleLinkItem';

const link: DetectedLink = {
  platform: {
    id: 'spotify',
    name: 'Spotify',
    category: 'dsp',
    icon: 'spotify',
    color: '#1ED760',
    placeholder: 'https://open.spotify.com/artist/...',
  },
  normalizedUrl: 'https://open.spotify.com/artist/sasha-waves',
  originalUrl: 'https://open.spotify.com/artist/sasha-waves',
  suggestedTitle: 'Spotify',
  isValid: true,
};

const meta = {
  title: 'Features/Dashboard/Organisms/Links/ChatStyleLinkItem/States',
  component: ChatStyleLinkItem,
  parameters: { layout: 'centered' },
  decorators: [
    function WidthDecorator(Story) {
      return (
        <div className='w-full max-w-sm'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    id: 'link-1',
    link,
    index: 0,
    onToggle: fn(),
    onRemove: fn(),
    onEdit: fn(),
    visible: true,
    openMenuId: null,
    onAnyMenuOpen: fn(),
    isLastAdded: false,
  },
} satisfies Meta<typeof ChatStyleLinkItem>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a hidden link, dimmed and without drag handle. */
export const PartialHiddenNoHandle: Story = {
  args: { visible: false, draggable: false },
};

/** Long content: a long profile URL that truncates. */
export const LongContent: Story = {
  args: {
    link: {
      ...link,
      suggestedTitle: 'An extraordinarily long artist profile title',
      normalizedUrl:
        'https://open.spotify.com/artist/an-extraordinarily-long-artist-slug-that-overflows',
    },
  },
};

/** Rtl: right-to-left layout. */
export const Rtl: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
