import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { DashboardAnalytics } from './DashboardAnalytics';

const dashboardData: DashboardData = {
  user: { id: 'story-user' },
  creatorProfiles: [
    {
      id: 'profile-1',
      userId: 'story-user',
      username: 'midnightsignal',
      displayName: 'Midnight Signal',
      avatarUrl: null,
      bio: 'Late night synth pop from Los Angeles.',
      spotifyId: null,
      spotifyUrl: null,
      appleMusicUrl: null,
      youtubeUrl: null,
      appleMusicId: null,
      youtubeMusicId: null,
      deezerId: null,
      tidalId: null,
      soundcloudId: null,
      venmoHandle: null,
      location: 'Los Angeles, CA',
      activeSinceYear: 2024,
      genres: ['Synth Pop'],
      careerHighlights: [],
      targetPlaylists: [],
      isPublic: true,
      isVerified: false,
      isFeatured: false,
      marketingOptOut: false,
      settings: {},
      theme: {},
      createdAt: new Date('2026-01-15T12:00:00.000Z'),
    } as DashboardData['creatorProfiles'][0],
  ],
  selectedProfile: {
    id: 'profile-1',
    userId: 'story-user',
    username: 'midnightsignal',
    displayName: 'Midnight Signal',
    avatarUrl: null,
    bio: 'Late night synth pop from Los Angeles.',
    spotifyId: null,
    spotifyUrl: null,
    appleMusicUrl: null,
    youtubeUrl: null,
    appleMusicId: null,
    youtubeMusicId: null,
    deezerId: null,
    tidalId: null,
    soundcloudId: null,
    venmoHandle: null,
    location: 'Los Angeles, CA',
    activeSinceYear: 2024,
    genres: ['Synth Pop'],
    careerHighlights: [],
    targetPlaylists: [],
    isPublic: true,
    isVerified: false,
    isFeatured: false,
    marketingOptOut: false,
    settings: {},
    theme: {},
    createdAt: new Date('2026-01-15T12:00:00.000Z'),
  } as DashboardData['selectedProfile'],
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: true,
  hasMusicLinks: true,
  isAdmin: false,
  tippingStats: {
    tipClicks: 0,
    qrTipClicks: 0,
    linkTipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
  profileCompletion: {
    percentage: 100,
    completedCount: 4,
    totalCount: 4,
    steps: [],
    profileIsLive: true,
  },
};

const meta = {
  title: 'Dashboard/Analytics/DashboardAnalytics',
  component: DashboardAnalytics,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <DashboardDataProvider value={dashboardData}>
        <div className='min-h-screen bg-surface-0 p-6 text-primary-token'>
          <Story />
        </div>
      </DashboardDataProvider>
    ),
  ],
} satisfies Meta<typeof DashboardAnalytics>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
