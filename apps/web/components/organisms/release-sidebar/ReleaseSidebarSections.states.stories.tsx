import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ProviderKey } from '@/lib/discography/types';
import { ReleaseEntityHeader } from './ReleaseSidebarSections';
import type { Release } from './types';

const baseRelease: Release = {
  profileId: 'profile_1',
  id: 'rel_1',
  title: 'Midnight Drive',
  artistNames: ['Example Artist'],
  releaseType: 'single',
  releaseDate: '2026-01-15',
  status: 'released',
  slug: 'midnight-drive',
  smartLinkPath: '/example/midnight-drive',
  isExplicit: false,
  totalTracks: 1,
  artworkUrl: 'https://placehold.co/400x400',
  providers: [],
};

const providerConfig: Record<ProviderKey, { label: string; accent: string }> =
  Object.create(null);

/** Header states for a release. The default header lives in ReleaseSidebarSections.stories.tsx. */
const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseSidebarSections/States',
  component: ReleaseEntityHeader,
  parameters: { layout: 'centered' },
  args: {
    release: baseRelease,
    artistName: 'Example Artist',
    providerConfig,
    canUploadArtwork: false,
    canRevertArtwork: false,
    onArtworkUpload: undefined,
    onArtworkRevert: undefined,
    allowDownloads: false,
    previewUrl: null,
    isPlaying: false,
    onTogglePreview: () => undefined,
  },
} satisfies Meta<typeof ReleaseEntityHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    release: { ...baseRelease, artworkUrl: undefined, artistNames: [] },
    artistName: null,
  },
};

export const Partial: Story = {
  args: {
    release: { ...baseRelease, releaseDate: undefined, totalTracks: 0 },
  },
};

export const LongContent: Story = {
  args: {
    release: {
      ...baseRelease,
      title:
        'An Exceptionally Long Release Title That Keeps Going Well Past The Width Of The Drawer Header',
      artistNames: [
        'An Artist With A Very Long Name',
        'Another Equally Long Collaborator',
        'A Third Featured Guest',
      ],
    },
  },
};

export const Playing: Story = {
  args: {
    previewUrl: 'https://cdn.example.com/preview.mp3',
    isPlaying: true,
  },
};

function RtlDecorator({ children }: { readonly children: React.ReactNode }) {
  return <div dir='rtl'>{children}</div>;
}

export const Rtl: Story = {
  args: {
    release: {
      ...baseRelease,
      title: 'قيادة منتصف الليل',
      artistNames: ['فنان تجريبي'],
    },
  },
  decorators: [
    function WithRtl(StoryComponent) {
      return (
        <RtlDecorator>
          <StoryComponent />
        </RtlDecorator>
      );
    },
  ],
};
