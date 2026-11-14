import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { PreviewPanelLink } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { ProfileLinkList } from './ProfileLinkList';

const links: PreviewPanelLink[] = [
  {
    id: 'link-1',
    title: 'Instagram',
    url: 'https://instagram.com/artist',
    platform: 'instagram',
    platformType: 'social',
    category: 'social',
    isVisible: true,
  },
  {
    id: 'link-2',
    title: 'Official site',
    url: 'https://artist.example.com',
    platform: 'website',
    platformType: 'websites',
    category: 'other',
    isVisible: true,
  },
];

const meta = {
  title: 'Dashboard/Profile/ProfileLinkList',
  component: ProfileLinkList,
  parameters: { layout: 'centered' },
  args: {
    links,
    selectedCategory: 'all' as const,
  },
} satisfies Meta<typeof ProfileLinkList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { links: [], selectedCategory: 'earnings' },
};

export const EmptyEditable: Story = {
  args: { links: [], selectedCategory: 'earnings', onAddLink: () => {} },
};

/** A stored URL that does not parse falls back to the raw text, not a crash. */
export const ErrorMalformedUrl: Story = {
  args: {
    links: [
      {
        id: 'link-bad',
        title: 'Website',
        url: 'artist dot example slash home',
        platform: 'website',
        platformType: 'websites',
        category: 'other',
        isVisible: true,
      },
    ],
    selectedCategory: 'custom',
  },
};

/** Spotify is connected without an artist name; Apple Music is not linked. */
export const PartialDspConnections: Story = {
  args: {
    links: [],
    selectedCategory: 'dsp',
    dspConnections: {
      spotify: { connected: true, artistName: null },
      appleMusic: { connected: false, artistName: null },
    },
  },
};

/** Many links with long handles and hosts stay within the rail width. */
export const LongContentManyLinks: Story = {
  args: {
    onAddLink: () => {},
    onRemoveLink: () => {},
    links: [
      {
        id: 'long-1',
        title: 'Instagram',
        url: 'https://instagram.com/the_extremely_long_artist_handle_for_a_collective',
        platform: 'instagram',
        category: 'social',
        isVisible: true,
      },
      {
        id: 'long-2',
        title: 'TikTok',
        url: 'https://tiktok.com/@the_extremely_long_artist_handle_for_a_collective',
        platform: 'tiktok',
        category: 'social',
        isVisible: false,
      },
      {
        id: 'long-3',
        title: 'Merch',
        url: 'https://merch.the-extremely-long-artist-name-for-a-collective.example.com/collections/tour',
        platform: 'website',
        category: 'commerce',
        isVisible: true,
      },
      {
        id: 'long-4',
        title: 'Official site',
        url: 'https://www.the-extremely-long-artist-name-for-a-collective.example.com',
        platform: 'website',
        category: 'other',
        isVisible: true,
        verificationStatus: 'verified',
      },
    ],
  },
  decorators: [
    Story => (
      <div className='w-72'>
        <Story />
      </div>
    ),
  ],
};

export const RtlLinks: Story = {
  args: { onRemoveLink: () => {} },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-72'>
        <Story />
      </div>
    ),
  ],
};
