import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
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

export const Empty: Story = {
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

export const CollapsedArtworkOnly: Story = {
  args: {
    collapsed: true,
    track: {
      trackTitle: null,
      artistName: null,
      artworkUrl: meta.args.track.artworkUrl,
    },
  },
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

export const PartialTrack: Story = {
  args: {
    track: {
      trackTitle: 'Never Say A Word',
      artistName: null,
      artworkUrl: null,
    },
  },
};

export const RtlOverflow: Story = {
  args: {
    track: {
      trackTitle: 'عنوان مسار طويل يجب اقتطاعه دون توسيع الشريط الجانبي',
      artistName: 'اسم الفنان',
      artworkUrl: null,
    },
  },
  decorators: [
    Story => (
      <div dir='rtl' className='w-57'>
        <Story />
      </div>
    ),
  ],
};

export const PlaybackDiscoverability: Story = {
  args: {
    onPlay: fn(),
    track: {
      trackTitle: 'Never Say A Word',
      artistName: null,
      artworkUrl: null,
    },
  },
  play: async ({ canvasElement, args }) => {
    const control = within(canvasElement).getByRole('button', {
      name: args.isPlaying ? 'Pause' : 'Play',
    });
    const wrapper = control.parentElement;
    if (!wrapper)
      throw new Error('Playback control must have a visibility wrapper');
    const idleOpacity = matchMedia('(hover: none)').matches ? '1' : '0';
    await waitFor(() =>
      expect(getComputedStyle(wrapper).opacity).toBe(idleOpacity)
    );
    const bounds = control.getBoundingClientRect().toJSON();
    await userEvent.tab();
    await expect(control).toHaveFocus();
    await waitFor(() => expect(getComputedStyle(wrapper).opacity).toBe('1'));
    await userEvent.keyboard('{Enter}');
    await expect(args.onPlay).toHaveBeenCalledOnce();
    await expect(control.getBoundingClientRect().toJSON()).toEqual(bounds);
    control.blur();
    await waitFor(() =>
      expect(getComputedStyle(wrapper).opacity).toBe(idleOpacity)
    );
  },
};

export const PauseDiscoverability: Story = {
  ...PlaybackDiscoverability,
  args: { ...PlaybackDiscoverability.args, isPlaying: true, onPlay: fn() },
};
