import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { MobileReleaseList } from './MobileReleaseList';

const releases: ReleaseViewModel[] = [
  {
    profileId: 'profile-1',
    id: 'release-1',
    title: 'Summer Lights',
    artistNames: ['Jovie Artist'],
    slug: 'summer-lights',
    releaseType: 'single',
    isExplicit: false,
    releaseDate: '2026-06-15',
    artworkUrl: undefined,
    totalTracks: 1,
    providers: [],
    spotifyPopularity: 67,
    smartLinkPath: '/summer-lights',
    previewUrl: null,
    primaryIsrc: null,
    upc: null,
    status: 'released',
  },
  {
    profileId: 'profile-1',
    id: 'release-2',
    title: 'Night Drive',
    artistNames: ['Jovie Artist', 'Guest Vocal'],
    slug: 'night-drive',
    releaseType: 'ep',
    isExplicit: false,
    releaseDate: '2026-09-18',
    artworkUrl: undefined,
    totalTracks: 4,
    providers: [],
    spotifyPopularity: 44,
    smartLinkPath: '/night-drive',
    previewUrl: null,
    primaryIsrc: null,
    upc: null,
    status: 'scheduled',
  },
];

const meta = {
  title: 'Dashboard/Releases/MobileReleaseList',
  component: MobileReleaseList,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['path', 'label', 'testId'],
    },
  },
  decorators: [
    Story => (
      <div className='w-96 bg-surface-0 p-3 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    releases,
    artistName: 'Jovie Artist',
    onEdit: fn(),
    onCopy: async () => 'Copied',
    canGenerateAlbumArt: true,
    onGenerateAlbumArt: fn(),
    onGeneratePitch: fn(),
  },
} satisfies Meta<typeof MobileReleaseList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ungrouped: Story = {};

export const GroupedByYear: Story = {
  args: {
    groupByYear: true,
  },
};

export const SmartLinkLocked: Story = {
  args: {
    isSmartLinkLocked: releaseId => releaseId === 'release-2',
    getSmartLinkLockReason: releaseId =>
      releaseId === 'release-2' ? 'scheduled' : null,
  },
};
