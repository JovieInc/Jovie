import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { PreviewPanelData } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import {
  ProfileBentoView,
  ProfileSidebarHeaderCard,
} from './ProfileContactSidebarSections';

const previewData: PreviewPanelData = {
  username: 'alex',
  displayName: 'Alex Rivera',
  avatarUrl: null,
  bio: 'Independent artist',
  genres: null,
  location: null,
  hometown: null,
  activeSinceYear: null,
  links: [],
  profilePath: '/alex',
  dspConnections: {
    spotify: { connected: false, artistName: null },
    appleMusic: { connected: false, artistName: null },
  },
};

const meta = {
  title: 'Features/Dashboard/ProfileContactSidebar/ProfileBentoView',
  component: ProfileBentoView,
  args: {
    previewData,
    profileUrl: 'https://jov.ie/alex',
    onManageConnections: fn(),
  },
} satisfies Meta<typeof ProfileBentoView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A brand-new profile: no display name, bio, location or links yet. */
export const EmptyNewProfile: Story = {
  args: {
    previewData: {
      ...previewData,
      displayName: '',
      bio: null,
      links: [],
    },
  },
  render: args => (
    <div className='w-80'>
      <ProfileSidebarHeaderCard
        previewData={args.previewData}
        profileUrl={args.profileUrl}
        onClose={fn()}
        overflowActions={[]}
      />
    </div>
  ),
};

/** Display name only: the bio line is left out and the layout holds. */
export const PartialNoBio: Story = {
  args: {
    previewData: { ...previewData, bio: null, isVerified: true },
  },
};

/** Long names, handle and bio clamp instead of widening the rail. */
export const LongContentIdentity: Story = {
  args: {
    previewData: {
      ...previewData,
      username: 'the-extremely-long-artist-handle-for-a-whole-collective',
      displayName:
        'The Extremely Long Artist Name Of A Collective With Many Members',
      bio: 'Independent artist, producer and DJ touring every festival season across Europe, North America and Asia with a live band, a full visual show and a new record every spring.',
    },
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
};

export const RtlIdentity: Story = {
  args: {
    previewData: {
      ...previewData,
      displayName: 'ليلى حداد',
      bio: 'فنانة مستقلة ومنتجة موسيقية من بيروت',
    },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-80'>
        <Story />
      </div>
    ),
  ],
};
