import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FOUNDER_DEMO_PERSONA } from '@/lib/demo-personas';
import type { LibraryShareDropPublicView } from '@/lib/library-share/types';
import { LibraryShareDropSurface } from './LibraryShareDropSurface';

const RELEASE = FOUNDER_DEMO_PERSONA.releases[0];
const ARTIST = FOUNDER_DEMO_PERSONA.profile;

export const WEB171_DROP_VIEW = {
  token: 'drop-token',
  title: RELEASE.title,
  message: null,
  layout: 'grid',
  downloadsEnabled: false,
  requiresPassphrase: false,
  isExpired: false,
  artistName: ARTIST.displayName,
  artistHandle: ARTIST.handle,
  artistAvatarUrl: ARTIST.avatarSrc,
  accentColor: null,
  logoUrl: null,
  darkMode: true,
  assets: [
    {
      id: RELEASE.id,
      releaseId: RELEASE.id,
      title: RELEASE.title,
      artistName: ARTIST.displayName,
      artworkUrl: RELEASE.artworkUrl,
      previewUrl: null,
      lyrics: null,
      releaseType: RELEASE.releaseType,
      releaseDate: RELEASE.releaseDate,
      smartLinkPath: `/${ARTIST.handle}/${RELEASE.slug}`,
      includeArtwork: true,
      includePreview: false,
      includeLyrics: false,
    },
  ],
} satisfies LibraryShareDropPublicView;

const meta = {
  title: 'Public/Routes/LibraryShareDrop',
  component: LibraryShareDropSurface,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Deterministic source-backed unlocked state for web-171-drop--[token]. The story mounts the exact LibraryShareDropSurface with a checked-in founder demo release. The token is the existing test-only drop-token fixture; token lookup, passphrase access, metadata, and deployed drop data remain server-route-owned.',
      },
    },
    pen: {
      registryId: 'web-171-drop--[token]',
      route: '/drop/[token]',
      source:
        'apps/web/components/features/library-share/LibraryShareDropSurface.tsx',
      sourceExport: 'LibraryShareDropSurface',
      storyExport: 'Web171UnlockedDrop',
      sourceSha: '02193d203a6dce76657f5e3988a173fc35ae07ff',
      fixture: 'FOUNDER_DEMO_PERSONA.releases[0] + test-only drop-token',
      proofTier: 'source-backed',
    },
  },
  tags: ['autodocs'],
  args: { view: WEB171_DROP_VIEW, initialUnlocked: true },
} satisfies Meta<typeof LibraryShareDropSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web171UnlockedDrop: Story = {
  name: 'web-171 /drop/[token] — unlocked',
};
