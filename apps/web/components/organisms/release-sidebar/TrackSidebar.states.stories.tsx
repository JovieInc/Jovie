import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { TrackSidebar, type TrackSidebarData } from './TrackSidebar';

const baseTrack: TrackSidebarData = {
  id: 'track-1',
  title: 'Midnight Echo',
  slug: 'midnight-echo',
  smartLinkPath: '/r/echo/1',
  trackNumber: 1,
  discNumber: 1,
  durationMs: 181000,
  isrc: 'USRC17607839',
  isExplicit: false,
  previewUrl: null,
  audioUrl: null,
  audioFormat: null,
  previewSource: null,
  previewVerification: 'unknown',
  providers: [],
  releaseTitle: 'Midnight Echo (EP)',
  releaseArtworkUrl: null,
  releaseId: 'release-1',
};

function Frame(Story: () => ReactNode) {
  return (
    <div className='h-[40rem] w-96'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl' className='h-[40rem] w-96'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the track sidebar. The canonical story stays in
 * TrackSidebar.stories.tsx; these show the empty selection, a track without
 * links, a very long title and the document direction.
 */
const meta = {
  title: 'Organisms/ReleaseSidebar/TrackSidebar States',
  component: TrackSidebar,
  parameters: { layout: 'centered' },
  decorators: [Frame],
  args: {
    track: baseTrack,
    isOpen: true,
    onClose: fn(),
  },
} satisfies Meta<typeof TrackSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no track is selected. */
export const EmptyNoTrack: Story = { args: { track: null } };

/** Partial: a track with no platform links resolved yet. */
export const PartialNoProviders: Story = {};

/** Long content: a very long title wraps inside the header. */
export const LongContentTitle: Story = {
  args: {
    track: {
      ...baseTrack,
      title:
        'An Extraordinarily Long Track Title That Keeps Going Well Past The Sidebar Width (Extended Club Remix)',
    },
  },
};

/** Rtl: the sidebar follows the document direction. */
export const RtlDirection: Story = { decorators: [RtlFrame] };
