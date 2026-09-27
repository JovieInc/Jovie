import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarBottomNowPlaying } from './SidebarBottomNowPlaying';

const meta = {
  title: 'Shell/SidebarBottomNowPlaying',
  component: SidebarBottomNowPlaying,
  parameters: { layout: 'centered' },
  args: {
    isPlaying: false,
    onPlay: () => undefined,
    track: {
      trackTitle: 'Never Say A Word',
      artistName: 'Tim White',
      artworkUrl: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    },
  },
} satisfies Meta<typeof SidebarBottomNowPlaying>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Paused: Story = {};

export const Playing: Story = {
  args: { isPlaying: true },
};

export const Idle: Story = {
  args: {
    track: { trackTitle: null, artistName: null, artworkUrl: null },
  },
};

export const LongTitle: Story = {
  args: {
    track: {
      trackTitle:
        'A Very Long Track Title That Must Truncate Without Widening the Sidebar',
      artistName: 'An Artist With An Equally Long Display Name',
      artworkUrl: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    },
  },
  decorators: [
    StoryComponent => (
      <div className='w-57'>
        <StoryComponent />
      </div>
    ),
  ],
};

export const CollapsedSidebar: Story = {
  args: { collapsed: true, isPlaying: true },
};

export const LightAndDark: Story = {
  render: args => (
    <div className='grid grid-cols-2 gap-6 bg-base p-6'>
      <div className='w-57 bg-base p-2'>
        <SidebarBottomNowPlaying {...args} />
      </div>
      <div className='dark w-57 bg-base p-2'>
        <SidebarBottomNowPlaying {...args} />
      </div>
    </div>
  ),
};
