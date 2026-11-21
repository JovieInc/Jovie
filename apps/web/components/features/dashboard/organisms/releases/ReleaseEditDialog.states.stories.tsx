import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { ReleaseEditDialog } from './ReleaseEditDialog';

function buildRelease(title: string): ReleaseViewModel {
  return {
    profileId: 'profile-1',
    id: 'release-1',
    title,
    status: 'released',
    slug: 'skyline-dreams',
    releaseType: 'single',
    isExplicit: false,
    releaseDate: '2026-06-15',
    artworkUrl: undefined,
    totalTracks: 1,
    providers: [
      {
        key: 'spotify',
        url: 'https://open.spotify.com/album/1',
        source: 'manual',
        updatedAt: '2026-01-01T00:00:00.000Z',
        label: 'Spotify',
        path: '/spotify',
        isPrimary: true,
      },
    ],
    spotifyPopularity: null,
    smartLinkPath: '/smart/release-1',
    previewUrl: null,
    primaryIsrc: null,
    upc: null,
  };
}

const spotify = {
  key: 'spotify' as ProviderKey,
  label: 'Spotify',
  accent: '#1DB954',
  isPrimary: true,
};

const meta = {
  title: 'Features/Dashboard/Organisms/Releases/ReleaseEditDialog/States',
  component: ReleaseEditDialog,
  parameters: { layout: 'centered' },
  args: {
    release: buildRelease('Skyline Dreams'),
    providerList: [spotify],
    drafts: { spotify: 'https://open.spotify.com/album/1' },
    isSaving: false,
    onDraftChange: () => {},
    onSave: () => {},
    onReset: () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof ReleaseEditDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { providerList: [], drafts: {} },
};

export const LongContent: Story = {
  args: {
    release: buildRelease(
      'An Extraordinarily Long Release Title That Keeps Going Well Past One Line To Prove Truncation And Wrapping Hold Up'
    ),
    drafts: {
      spotify:
        'https://open.spotify.com/album/1?utm_source=a-very-long-campaign-name&utm_medium=social&utm_campaign=an-even-longer-campaign-identifier',
    },
  },
};

function RtlFrame({ children }: { readonly children: React.ReactNode }) {
  return <div dir='rtl'>{children}</div>;
}

export const Rtl: Story = {
  decorators: [
    function WithRtl(Story) {
      return (
        <RtlFrame>
          <Story />
        </RtlFrame>
      );
    },
  ],
};
