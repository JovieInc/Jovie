import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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
  title: 'Features/Dashboard/Organisms/Links/ChatStyleLinkItem',
  component: ChatStyleLinkItem,
  parameters: {
    jovie: {
      uncoveredProps: ['disabled'],
    },
    layout: 'centered',
  },
} satisfies Meta<typeof ChatStyleLinkItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    id: 'link-1',
    link,
    index: 0,
    onToggle: () => {},
    onRemove: () => {},
    onEdit: () => {},
    visible: true,
    openMenuId: null,
    onAnyMenuOpen: () => {},
    isLastAdded: false,
  },
};
