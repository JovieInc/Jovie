import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import type { LibraryAssetShareViewModel } from '@/lib/library/asset-share';
import { LibraryAssetSharePanel } from './LibraryAssetSharePanel';

const asset = {
  id: 'r1',
  title: 'Drive',
  artist: 'Example artist',
  artworkUrl: null,
  previewUrl: null,
  videoUrl: null,
  waveformSeed: 17,
  smartLinkPath: '/example/drive',
  releaseDate: null,
  releaseType: 'single',
  status: 'draft',
  approvalStatus: 'draft',
  profileVisibility: 'hidden',
  trackCount: 1,
  providerCount: 0,
  providers: [],
  hasLyrics: false,
  hasArtwork: false,
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
} satisfies LibraryReleaseAsset;

const privateShare = {
  assetId: asset.id,
  visibility: 'private',
  shareSlug: 'drive',
  accessToken: 'story-private',
  shareUrl: 'https://jov.ie/p/story-private',
  tokenRevokedAt: null,
} satisfies LibraryAssetShareViewModel;

type ApiMockGlobal = typeof globalThis & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

const meta = {
  title: 'Features/Library/LibraryAssetSharePanel States',
  decorators: [
    function MetaDecorator(Story) {
      return (
        <div className='w-80 max-w-full'>
          <Story />
        </div>
      );
    },
  ],
  component: LibraryAssetSharePanel,
  parameters: { layout: 'centered', shareApi: 'ok' },
  args: {
    asset,
    profileId: 'p1',
    artistHandle: 'example',
    disabled: false,
    initialShare: privateShare,
    onShareChange: fn(),
  },
  // The preview's API hook answers the share endpoints without a backend;
  // `shareApi: 'fail'` makes every share request fail.
  beforeEach: ({ parameters }) => {
    const target = globalThis as ApiMockGlobal;
    const previous = target.__jovieApiMock;
    target.__jovieApiMock = request => {
      if (request.url.pathname.startsWith('/api/library/asset-share')) {
        return parameters.shareApi === 'fail'
          ? new Response(null, { status: 500 })
          : Response.json({ share: privateShare });
      }
      return previous?.(request);
    };
    return () => {
      target.__jovieApiMock = previous;
    };
  },
} satisfies Meta<typeof LibraryAssetSharePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no profile context yet, so no link exists and none is requested. */
export const EmptyNoProfile: Story = {
  args: { profileId: null, artistHandle: null, initialShare: null },
};

/** Error: generating the link failed; the row keeps its placeholder. */
export const ErrorLinkUnavailable: Story = {
  args: { initialShare: null },
  parameters: { shareApi: 'fail' },
};

/** Partial: a stored link without profile context; its actions are held. */
export const PartialNoProfileContext: Story = {
  args: { profileId: null },
};

/** Long content: a long release title and share URL. */
export const LongContent: Story = {
  args: {
    asset: {
      ...asset,
      title:
        'Drive (Extended Sunrise Mix featuring the Whole Band, Live from the Rooftop)',
    },
    initialShare: {
      ...privateShare,
      shareUrl:
        'https://jov.ie/p/story-private-link-for-the-extended-sunrise-mix-with-the-whole-band',
    },
  },
};

/** Rtl: an Arabic release title in a right-to-left document. */
export const Rtl: Story = {
  args: { asset: { ...asset, title: 'القيادة' } },
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
