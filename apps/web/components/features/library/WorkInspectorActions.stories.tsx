import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import type { WorkLaunchSummary } from '@/lib/library/work-actions';
import { WorkInspectorActions } from './WorkInspectorActions';

const asset = {
  id: 'release-1',
  title: 'Take Me Over',
  artist: 'Tim White',
  artworkUrl: null,
  previewUrl: null,
  videoUrl: null,
  waveformSeed: 17,
  smartLinkPath: '/tim/take-me-over',
  releaseDate: '2026-04-28T00:00:00.000Z',
  releaseType: 'single',
  status: 'released',
  approvalStatus: 'draft',
  profileVisibility: 'visible',
  trackCount: 1,
  providerCount: 1,
  providers: [],
  hasLyrics: false,
  hasArtwork: true,
  hasVideoLinks: false,
  assetKinds: [],
  genres: [],
  spotifyPopularity: null,
  targetPlaylistCount: 0,
  isExplicit: false,
  label: null,
  upc: null,
  distributor: null,
  totalDurationMs: null,
} as LibraryReleaseAsset;

const readyLaunch = {
  id: 'launch-1',
  workId: 'release-1',
  title: 'Take Me Over launch',
  kitStatus: 'ready',
  pressKitHref: '/app/releases/release-1/press-kit',
  pressReleaseHref: '/app/releases/release-1/press-release',
  launchHref: '/app/releases/release-1/tasks',
} as WorkLaunchSummary;

const meta = {
  title: 'Library/WorkInspectorActions',
  component: WorkInspectorActions,
  args: {
    asset,
    launches: [],
    canPublish: true,
    disabled: false,
    onSharePrivately: () => undefined,
  },
} satisfies Meta<typeof WorkInspectorActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LivePublicWork: Story = {};

export const PreparedUnpublished: Story = {
  args: {
    asset: { ...asset, status: 'scheduled', smartLinkPath: '' },
  },
};

export const PublishBlockedByPermissions: Story = {
  args: {
    asset: { ...asset, status: 'draft', smartLinkPath: '' },
    canPublish: false,
  },
};

export const IntentionallyPrivateWork: Story = {
  args: {
    asset: { ...asset, profileVisibility: 'hidden' },
  },
};

export const ReadyLaunch: Story = {
  args: { launches: [readyLaunch] },
};

export const LaunchStates: Story = {
  args: {
    launches: [
      { ...readyLaunch, id: 'l-prep', kitStatus: 'preparing' },
      { ...readyLaunch, id: 'l-fail', kitStatus: 'failed' },
      readyLaunch,
    ],
    onRetryLaunchKit: () => undefined,
  },
};
