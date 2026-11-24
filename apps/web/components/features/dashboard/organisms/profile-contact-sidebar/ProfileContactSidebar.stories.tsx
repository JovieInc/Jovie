import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect } from 'react';
import { withDashboardProviders } from '@/.storybook/dashboard-fixtures';
import { withSignedInSession } from '@/.storybook/signed-in-session';
import {
  type PreviewPanelData,
  PreviewPanelProvider,
  usePreviewPanelData,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { ProfileContactSidebar } from './ProfileContactSidebar';

const basePreview: PreviewPanelData = {
  username: 'sashawaves',
  displayName: 'Sasha Waves',
  avatarUrl: null,
  bio: 'Independent artist',
  genres: ['electronic'],
  location: 'Los Angeles, CA',
  hometown: 'Chicago, IL',
  activeSinceYear: 2019,
  profileEditVersion: 1,
  links: [
    {
      id: 'link-1',
      title: 'Instagram',
      url: 'https://instagram.com/sashawaves',
      platform: 'instagram',
      isVisible: true,
      version: 1,
    },
  ],
  profilePath: '/sashawaves',
  dspConnections: {
    spotify: { connected: true, artistName: 'Sasha Waves' },
    appleMusic: { connected: false, artistName: null },
  },
};

/** Seeds PreviewPanelContext so the rail paints without a live hydrator. */
function SeedPreview({ data }: { readonly data: PreviewPanelData | null }) {
  const { setPreviewData } = usePreviewPanelData();
  useEffect(() => {
    setPreviewData(data);
  }, [data, setPreviewData]);
  return null;
}

function Rail({
  data,
  dir,
}: {
  readonly data: PreviewPanelData | null;
  readonly dir?: 'rtl';
}) {
  return (
    <PreviewPanelProvider defaultOpen>
      <SeedPreview data={data} />
      <div
        dir={dir}
        lang={dir === 'rtl' ? 'ar' : undefined}
        className='h-screen'
      >
        <ProfileContactSidebar />
      </div>
    </PreviewPanelProvider>
  );
}

// Argless surface for Meta typing so shared dashboard decorators type-check.
function DashboardProfileContactSidebar() {
  return <ProfileContactSidebar />;
}

const meta = {
  title: 'Dashboard/ProfileContactSidebar',
  component: DashboardProfileContactSidebar,
  parameters: { layout: 'fullscreen' },
  decorators: [withDashboardProviders, withSignedInSession],
} satisfies Meta<typeof DashboardProfileContactSidebar>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No preview payload yet: the rail shows its skeleton. */
export const Loading: Story = {
  render: () => <Rail data={null} />,
};

/** Profile exists but has no links, bio, location, or DSP connections. */
export const Empty: Story = {
  render: () => (
    <Rail
      data={{
        ...basePreview,
        bio: null,
        genres: null,
        location: null,
        hometown: null,
        activeSinceYear: null,
        links: [],
        dspConnections: {
          spotify: { connected: false, artistName: null },
          appleMusic: { connected: false, artistName: null },
        },
      }}
    />
  ),
};

/** Display name present; bio and location still empty. */
export const PartialIdentity: Story = {
  render: () => (
    <Rail
      data={{
        ...basePreview,
        bio: null,
        location: null,
        hometown: null,
        genres: null,
        links: [],
      }}
    />
  ),
};

/** Long identity and link titles stay inside the rail width. */
export const LongContentIdentity: Story = {
  render: () => (
    <Rail
      data={{
        ...basePreview,
        username: 'the-extremely-long-artist-handle-for-a-whole-collective',
        displayName:
          'The Extremely Long Artist Name Of A Collective With Many Members',
        bio: 'Independent artist, producer and DJ touring every festival season across Europe, North America and Asia with a live band, a full visual show and a new record every spring.',
        location: 'Los Angeles / London / Tokyo / Berlin / São Paulo',
        links: [
          {
            id: 'long-1',
            title: 'Instagram',
            url: 'https://instagram.com/the_extremely_long_artist_handle_for_a_collective',
            platform: 'instagram',
            isVisible: true,
            version: 1,
          },
          {
            id: 'long-2',
            title: 'Official site',
            url: 'https://www.the-extremely-long-artist-name-for-a-collective.example.com/tour',
            platform: 'website',
            isVisible: true,
            version: 1,
          },
        ],
        profilePath: '/the-extremely-long-artist-handle-for-a-whole-collective',
      }}
    />
  ),
};

export const RtlIdentity: Story = {
  render: () => (
    <Rail
      dir='rtl'
      data={{
        ...basePreview,
        username: 'layla',
        displayName: 'ليلى حداد',
        bio: 'فنانة مستقلة ومنتجة موسيقية من بيروت',
        location: 'بيروت، لبنان',
        links: [
          {
            id: 'ar-1',
            title: 'إنستغرام',
            url: 'https://instagram.com/layla',
            platform: 'instagram',
            isVisible: true,
            version: 1,
          },
        ],
        profilePath: '/layla',
      }}
    />
  ),
};
