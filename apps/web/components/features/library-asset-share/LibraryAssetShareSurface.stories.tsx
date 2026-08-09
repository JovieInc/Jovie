import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FOUNDER_DEMO_PERSONA } from '@/lib/demo-personas';
import type { LibraryAssetSharePublicView } from '@/lib/library/asset-share';
import { LibraryAssetShareSurface } from './LibraryAssetShareSurface';

const RELEASE = FOUNDER_DEMO_PERSONA.releases[0];
const ARTIST = FOUNDER_DEMO_PERSONA.profile;

export const WEB194_PRIVATE_ASSET_VIEW = {
  assetId: RELEASE.id,
  itemKind: 'release',
  title: RELEASE.title,
  artistName: ARTIST.displayName,
  artistHandle: ARTIST.handle,
  artworkUrl: RELEASE.artworkUrl,
  previewUrl: null,
  smartLinkPath: `/${ARTIST.handle}/${RELEASE.slug}`,
  visibility: 'private',
} satisfies LibraryAssetSharePublicView;

const meta = {
  title: 'Public/Routes/LibraryAssetPrivateShare',
  component: LibraryAssetShareSurface,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Deterministic source-backed presentation for web-194-p--[token]. The story mounts the exact LibraryAssetShareSurface with a checked-in founder demo release. Private-token lookup, notFound behavior, metadata, and deployed asset data remain server-route-owned.',
      },
    },
    pen: {
      registryId: 'web-194-p--[token]',
      route: '/p/[token]',
      source:
        'apps/web/components/features/library-asset-share/LibraryAssetShareSurface.tsx',
      sourceExport: 'LibraryAssetShareSurface',
      storyExport: 'Web194PrivateRelease',
      sourceSha: '02193d203a6dce76657f5e3988a173fc35ae07ff',
      fixture: 'FOUNDER_DEMO_PERSONA.releases[0]',
      proofTier: 'source-backed',
    },
  },
  tags: ['autodocs'],
  args: { view: WEB194_PRIVATE_ASSET_VIEW },
} satisfies Meta<typeof LibraryAssetShareSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web194PrivateRelease: Story = {
  name: 'web-194 /p/[token] — private release',
};
