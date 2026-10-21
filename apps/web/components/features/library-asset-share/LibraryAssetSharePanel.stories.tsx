import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
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

const publicShare: LibraryAssetShareViewModel = {
  ...privateShare,
  visibility: 'public',
  shareUrl: 'https://jov.ie/a/example/drive',
};

type ApiMockGlobal = typeof globalThis & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

const meta = {
  title: 'Features/Library/LibraryAssetSharePanel',
  decorators: [
    Story => (
      <div className='w-80 max-w-full'>
        <Story />
      </div>
    ),
  ],
  component: LibraryAssetSharePanel,
  parameters: { layout: 'centered', chromatic: { viewports: [390, 1024] } },
  args: {
    asset,
    profileId: 'p1',
    artistHandle: 'example',
    disabled: false,
    initialShare: privateShare,
    onShareChange: fn(),
  },
  // Use the preview's existing API hook so controls remain interactive without
  // contacting a backend. Each story gets isolated state and restores the hook.
  beforeEach: ({ args }) => {
    const target = globalThis as ApiMockGlobal;
    const previous = target.__jovieApiMock;
    let share: LibraryAssetShareViewModel = args.initialShare ?? privateShare;
    target.__jovieApiMock = request => {
      if (request.url.pathname === '/api/library/asset-share/revoke') {
        share = {
          ...privateShare,
          accessToken: 'story-rotated',
          shareUrl: 'https://jov.ie/p/story-rotated',
        };
        return Response.json({ share });
      }
      if (request.url.pathname === '/api/library/asset-share') {
        if (request.init?.method === 'PATCH') {
          const body = JSON.parse(String(request.init.body)) as {
            visibility: string;
          };
          share = body.visibility === 'public' ? publicShare : privateShare;
        }
        return Response.json({ share });
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

export const ShareLinkRow: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('URL To Copy')).toHaveValue(
      'jov.ie/p/story-private'
    );
    await expect(
      canvas.getByRole('button', { name: 'Copy to clipboard' })
    ).toBeVisible();
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole('menu')
    ).not.toBeInTheDocument();
  },
};

export const PrivateActions: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Share link actions for Drive' })
    );
    await expect(
      await body.findByRole('menuitem', { name: 'Make public' })
    ).toBeVisible();
    await expect(
      body.getByRole('menuitem', { name: 'Revoke private link' })
    ).toBeVisible();
  },
};

export const PublicActions: Story = {
  args: { initialShare: publicShare },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByLabelText('URL To Copy')).toHaveValue(
      'jov.ie/a/example/drive'
    );
    await userEvent.click(
      canvas.getByRole('button', { name: 'Share link actions for Drive' })
    );
    await expect(
      await body.findByRole('menuitem', { name: 'Make private' })
    ).toBeVisible();
    await expect(
      body.queryByRole('menuitem', { name: 'Revoke private link' })
    ).not.toBeInTheDocument();
  },
};

export const WithPrivateFileSharing: Story = {
  args: { onSharePrivately: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Share link actions for Drive' })
    );
    await userEvent.click(
      await body.findByRole('menuitem', { name: 'Share Files Privately' })
    );
    await expect(args.onSharePrivately).toHaveBeenCalledOnce();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Share link actions for Drive' })
    );
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', {
        name: 'Share link actions for Drive',
      })
    ).toBeDisabled();
  },
};

export const GenerateLink: Story = {
  args: { initialShare: null },
  play: async ({ canvasElement, args }) => {
    await waitFor(async () => {
      await expect(
        within(canvasElement).getByLabelText('URL To Copy')
      ).toHaveValue('jov.ie/p/story-private');
    });
    await expect(args.onShareChange).toHaveBeenCalledWith(
      asset.id,
      privateShare
    );
  },
};

export const VisibilityToggle: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Share link actions for Drive' })
    );
    await userEvent.click(
      await body.findByRole('menuitem', { name: 'Make public' })
    );
    await expect(canvas.getByLabelText('URL To Copy')).toHaveValue(
      'jov.ie/a/example/drive'
    );
    await expect(args.onShareChange).toHaveBeenCalledWith(
      asset.id,
      publicShare
    );
  },
};

export const RevokePrivateLink: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Share link actions for Drive' })
    );
    await userEvent.click(
      await body.findByRole('menuitem', { name: 'Revoke private link' })
    );
    await expect(canvas.getByLabelText('URL To Copy')).toHaveValue(
      'jov.ie/p/story-rotated'
    );
    await expect(args.onShareChange).toHaveBeenCalledWith(
      asset.id,
      expect.objectContaining({ accessToken: 'story-rotated' })
    );
  },
};
