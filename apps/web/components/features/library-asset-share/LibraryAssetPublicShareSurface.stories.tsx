import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FOUNDER_DEMO_PERSONA } from '@/lib/demo-personas';
import type { LibraryAssetSharePublicView } from '@/lib/library/asset-share';
import { LibraryAssetShareSurface } from './LibraryAssetShareSurface';

const RELEASE = FOUNDER_DEMO_PERSONA.releases[0];
const ARTIST = FOUNDER_DEMO_PERSONA.profile;

export const WEB058_PUBLIC_ASSET_VIEW = {
  assetId: RELEASE.id,
  itemKind: 'release',
  title: RELEASE.title,
  artistName: ARTIST.displayName,
  artistHandle: ARTIST.handle,
  artworkUrl: RELEASE.artworkUrl,
  previewUrl: null,
  smartLinkPath: `/${ARTIST.handle}/${RELEASE.slug}`,
  visibility: 'public',
} satisfies LibraryAssetSharePublicView;

const meta = {
  title: 'Public/Routes/LibraryAssetPublicShare',
  component: LibraryAssetShareSurface,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Deterministic source-backed public state for web-058-a--[handle]--[slug]. It reuses the exact LibraryAssetShareSurface and the same checked-in founder release fixture as the private-share contract. Slug lookup, unpublished alerts, metadata, notFound, and deployed asset data remain route-owned.',
      },
    },
    pen: {
      registryId: 'web-058-a--[handle]--[slug]',
      route: '/a/timwhite/the-deep-end',
      source:
        'apps/web/components/features/library-asset-share/LibraryAssetShareSurface.tsx',
      sourceExport: 'LibraryAssetShareSurface',
      storyExport: 'Web058PublicRelease',
      sourceSha: '12224180f432e72653646f5588a5e320a92b493e',
      fixture: 'FOUNDER_DEMO_PERSONA.releases[0]',
      proofTier: 'source-backed',
    },
  },
  tags: ['autodocs'],
  args: { view: WEB058_PUBLIC_ASSET_VIEW },
} satisfies Meta<typeof LibraryAssetShareSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web058PublicRelease: Story = {
  name: 'web-058 /a/timwhite/the-deep-end',
};
