import '@/styles/system-b-app.css';
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

const launch = {
  id: 'launch-1',
  workId: 'release-1',
  title: 'Take Me Over launch',
  kitStatus: 'ready',
  pressKitHref: '/app/releases/release-1/press-kit',
  pressReleaseHref: '/app/releases/release-1/press-release',
  launchHref: '/app/releases/release-1/tasks',
} as WorkLaunchSummary;

const meta = {
  title: 'Library/WorkInspectorActions States',
  component: WorkInspectorActions,
  decorators: [
    function MetaDecorator(Story) {
      return (
        <div className='font-sans text-primary-token' style={{ width: 245 }}>
          <Story />
        </div>
      );
    },
  ],
  args: {
    asset,
    launches: [],
    canPublish: true,
    disabled: false,
    onAskJovie: () => undefined,
    onSharePrivately: () => undefined,
  },
} satisfies Meta<typeof WorkInspectorActions>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a work with no launch and no Ask action available. */
export const EmptyNoLaunches: Story = {
  args: { launches: [], onAskJovie: undefined },
};

/** Error: press kit generation failed, with a retry action. */
export const ErrorLaunchKitFailed: Story = {
  args: {
    launches: [
      { ...launch, kitStatus: 'failed', kitStatusDetail: 'Artwork missing' },
    ],
    onRetryLaunchKit: () => undefined,
  },
};

/** Partial: the press kit is still preparing or needs more input. */
export const PartialLaunchKit: Story = {
  args: {
    launches: [
      { ...launch, id: 'l-prep', kitStatus: 'preparing' },
      {
        ...launch,
        id: 'l-input',
        kitStatus: 'needs_input',
        kitStatusDetail: 'add a press photo',
      },
    ],
  },
};

/** Long content: a long launch title and failure detail, both truncated. */
export const LongContent: Story = {
  args: {
    launches: [
      {
        ...launch,
        title:
          'Take Me Over (Extended Sunrise Mix featuring the Whole Band) worldwide launch',
        kitStatus: 'failed',
        kitStatusDetail:
          'The artwork, lyric sheet and press photo are all missing from the release',
      },
    ],
    onRetryLaunchKit: () => undefined,
  },
};

/** Permission denied: a draft work the viewer may not publish. */
export const PermissionDeniedPublish: Story = {
  args: {
    asset: { ...asset, status: 'draft', smartLinkPath: '' },
    canPublish: false,
  },
};

/** Rtl: Arabic launch copy in a right-to-left document. */
export const Rtl: Story = {
  args: { launches: [{ ...launch, title: 'إطلاق خذني' }] },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
