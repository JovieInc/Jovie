import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { SmartLinkCell } from './SmartLinkCell';

const release: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Skyline Dreams',
  slug: 'skyline-dreams',
  releaseType: 'single',
  status: 'released',
  isExplicit: false,
  releaseDate: '2026-01-01',
  artworkUrl: undefined,
  totalTracks: 1,
  providers: [],
  spotifyPopularity: null,
  smartLinkPath: '/smart/release-1',
  previewUrl: 'https://cdn.example.com/preview.mp3',
  primaryIsrc: null,
  upc: null,
};

const meta = {
  title: 'Dashboard/Organisms/Releases/Cells/SmartLinkCell',
  component: SmartLinkCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    release,
  },
} satisfies Meta<typeof SmartLinkCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unlocked: Story = {};

export const LockedScheduled: Story = {
  args: {
    locked: true,
    lockReason: 'scheduled',
  },
};

export const LockedCap: Story = {
  args: {
    locked: true,
    lockReason: 'cap',
  },
};
