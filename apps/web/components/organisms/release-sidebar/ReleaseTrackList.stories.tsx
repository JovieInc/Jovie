import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReleaseSidebarTrack } from '@/lib/discography/types';
import { ReleaseTrackList } from './ReleaseTrackList';
import type { Release } from './types';

const mockRelease: Release = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Midnight Echo',
  artistNames: ['Nova Rey'],
  status: 'released',
  slug: 'midnight-echo',
  smartLinkPath: '/r/midnight-echo',
  providers: [],
  releaseType: 'ep',
  isExplicit: false,
  totalTracks: 3,
  totalDiscs: 1,
};

const mockTracks: ReleaseSidebarTrack[] = [
  {
    id: 'track-1',
    releaseId: 'release-1',
    releaseSlug: 'midnight-echo',
    title: 'Midnight Echo',
    slug: 'midnight-echo',
    smartLinkPath: '/r/midnight-echo/track-1',
    trackNumber: 1,
    discNumber: 1,
    durationMs: 181000,
    isrc: 'USRC17607839',
    isExplicit: false,
    previewUrl: null,
    audioUrl: null,
    audioFormat: null,
    providers: [],
  },
  {
    id: 'track-2',
    releaseId: 'release-1',
    releaseSlug: 'midnight-echo',
    title: 'Static Bloom',
    slug: 'static-bloom',
    smartLinkPath: '/r/midnight-echo/track-2',
    trackNumber: 2,
    discNumber: 1,
    durationMs: 204000,
    isrc: 'USRC17607840',
    isExplicit: false,
    previewUrl: null,
    audioUrl: null,
    audioFormat: null,
    providers: [],
  },
  {
    id: 'track-3',
    releaseId: 'release-1',
    releaseSlug: 'midnight-echo',
    title: 'Glass Avenue',
    slug: 'glass-avenue',
    smartLinkPath: '/r/midnight-echo/track-3',
    trackNumber: 3,
    discNumber: 1,
    durationMs: 197000,
    isrc: null,
    isExplicit: true,
    previewUrl: null,
    audioUrl: null,
    audioFormat: null,
    providers: [],
  },
];

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseTrackList',
  component: ReleaseTrackList,
  parameters: {
    layout: 'centered',
  },
  args: {
    release: mockRelease,
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReleaseTrackList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    tracksOverride: [],
  },
};

export const Populated: Story = {
  args: {
    tracksOverride: mockTracks,
  },
};
