import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseSmartLinkAnalytics } from './ReleaseSmartLinkAnalytics';
import type { Release, ReleaseSidebarAnalytics } from './types';

const mockRelease: Release = {
  profileId: 'profile-calvin',
  id: 'release-im-not-alone-remixes',
  title: "I'm Not Alone Remixes",
  artistNames: ['Calvin Harris'],
  status: 'released',
  slug: 'im-not-alone-remixes',
  smartLinkPath: '/calvinharris/im-not-alone-remixes',
  providers: [],
  releaseType: 'ep',
  isExplicit: false,
  totalTracks: 4,
  totalDiscs: 1,
};

const readyAnalytics: ReleaseSidebarAnalytics = {
  totalClicks: 1842,
  last7DaysClicks: 126,
  lastClickAt: '2026-08-20T15:04:00.000Z',
  providerClicks: [{ provider: 'spotify', clicks: 940 }],
};

const emptyAnalytics: ReleaseSidebarAnalytics = {
  totalClicks: 0,
  last7DaysClicks: 0,
  lastClickAt: null,
  providerClicks: [],
};

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseSmartLinkAnalytics',
  component: ReleaseSmartLinkAnalytics,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['isLoading'],
    },
  },
  args: {
    release: mockRelease,
    artistName: 'Calvin Harris',
    variant: 'card',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-surface-1 p-3'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReleaseSmartLinkAnalytics>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  args: {
    analyticsOverride: readyAnalytics,
  },
};

export const Empty: Story = {
  args: {
    analyticsOverride: emptyAnalytics,
  },
};
