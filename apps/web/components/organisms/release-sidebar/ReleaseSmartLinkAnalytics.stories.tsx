import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseSmartLinkAnalytics } from './ReleaseSmartLinkAnalytics';
import type { Release } from './types';

const release = {
  id: 'release-1',
  title: 'Midnight Drive',
  slug: 'midnight-drive',
  smartLinkPath: '/tim/midnight-drive',
  releaseDate: '2026-08-08',
  artistNames: ['Tim White'],
} as Release;

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseSmartLinkAnalytics',
  component: ReleaseSmartLinkAnalytics,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['isLoading'] },
  },
} satisfies Meta<typeof ReleaseSmartLinkAnalytics>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithClicks: Story = {
  args: {
    release,
    artistName: 'Tim White',
    analyticsOverride: {
      totalClicks: 1842,
      last7DaysClicks: 126,
      lastClickAt: '2026-08-22T18:00:00.000Z',
      providerClicks: [{ provider: 'spotify', clicks: 1032 }],
    },
  },
};
