import { redirect } from 'next/navigation';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import DashboardLayoutClient from '@/app/app/(shell)/dashboard/DashboardLayoutClient';
import { MyStatsig } from '@/app/my-statsig';
import { DashboardOverview } from '@/components/dashboard/organisms/DashboardOverview';
import type { Artist } from '@/types/db';

export default function SidebarDemoPage() {
  if (process.env.NODE_ENV === 'production') {
    redirect('/');
  }

  const mockArtist: Artist = {
    id: 'artist-demo',
    owner_user_id: 'user-demo',
    handle: 'demo-artist',
    spotify_id: 'demo-spotify-id',
    name: 'Demo Artist',
    image_url: undefined,
    tagline: 'This is a demo artist used for local dashboard layout testing.',
    theme: undefined,
    settings: { hide_branding: false },
    spotify_url: 'https://open.spotify.com/artist/demo',
    apple_music_url: 'https://music.apple.com/artist/demo',
    youtube_url: 'https://youtube.com/@demo',
    venmo_handle: undefined,
    published: true,
    is_verified: false,
    is_featured: false,
    marketing_opt_out: false,
    created_at: '2023-01-01T00:00:00.000Z',
  };

  const mockDashboardData: DashboardData = {
    user: {
      id: 'demo-user',
    },
    creatorProfiles: [],
    selectedProfile: null,
    needsOnboarding: false,
    sidebarCollapsed: false,
    hasSocialLinks: true,
    hasMusicLinks: false,
    isAdmin: false,
    tippingStats: {
      tipClicks: 120,
      qrTipClicks: 0,
      linkTipClicks: 120,
      tipsSubmitted: 80,
      totalReceivedCents: 42000,
      monthReceivedCents: 0,
    },
  };

  return (
    <MyStatsig userId={mockDashboardData.user?.id ?? null}>
      <DashboardDataProvider value={mockDashboardData}>
        <DashboardLayoutClient dashboardData={mockDashboardData}>
          <DashboardOverview
            artist={mockArtist}
            hasSocialLinks={mockDashboardData.hasSocialLinks}
          />
        </DashboardLayoutClient>
      </DashboardDataProvider>
    </MyStatsig>
  );
}
