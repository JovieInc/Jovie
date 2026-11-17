import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { GroupedLinksManager } from './GroupedLinksManager';

const instagram: DetectedLink = {
  platform: {
    id: 'instagram',
    name: 'Instagram',
    category: 'social',
    icon: 'instagram',
    color: '#C13584',
    placeholder: 'https://instagram.com/user',
  },
  normalizedUrl: 'https://instagram.com/sashawaves',
  originalUrl: 'https://instagram.com/sashawaves',
  suggestedTitle: 'Instagram',
  isValid: true,
};

const spotify: DetectedLink = {
  platform: {
    id: 'spotify',
    name: 'Spotify',
    category: 'dsp',
    icon: 'spotify',
    color: '#1DB954',
    placeholder: 'https://open.spotify.com/artist/...',
  },
  normalizedUrl: 'https://open.spotify.com/artist/abc123',
  originalUrl: 'https://open.spotify.com/artist/abc123',
  suggestedTitle: 'Spotify',
  isValid: true,
};

/**
 * The profile links manager: the universal link input, quick-add platform
 * pills and the creator's link list.
 */
const meta = {
  title: 'Dashboard/Organisms/GroupedLinksManager',
  component: GroupedLinksManager,
  parameters: { layout: 'padded' },
  args: {
    initialLinks: [instagram, spotify],
    onLinksChange: fn(),
    onLinkAdded: fn(),
    creatorName: 'Sasha Waves',
    isMusicProfile: true,
  },
  decorators: [
    Story => (
      <div className='h-160 max-w-3xl'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GroupedLinksManager>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A creator with an Instagram and a Spotify link. */
export const Default: Story = {};

/** Empty: no links yet, so the first-link empty state shows under the input. */
export const EmptyNoLinks: Story = {
  args: { initialLinks: [] },
};

/** With the sidebar open the manager shows only the input and a profile prompt. */
export const SidebarOpen: Story = {
  args: { initialLinks: [], sidebarOpen: true },
};
