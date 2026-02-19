/**
 * Static mock data for dashboard showcase components.
 *
 * All data is hardcoded — no DB, no auth, no server actions.
 * Used exclusively by marketing page product demos.
 */

// ── Analytics ────────────────────────────────────────────────────────────────

export interface DailyClicks {
  date: string; // e.g. "Jan 21"
  clicks: number;
}

/** 30 days of click data with a realistic growth trend */
export const DAILY_CLICKS: DailyClicks[] = [
  { date: 'Jan 21', clicks: 42 },
  { date: 'Jan 22', clicks: 38 },
  { date: 'Jan 23', clicks: 55 },
  { date: 'Jan 24', clicks: 61 },
  { date: 'Jan 25', clicks: 48 },
  { date: 'Jan 26', clicks: 34 },
  { date: 'Jan 27', clicks: 29 },
  { date: 'Jan 28', clicks: 67 },
  { date: 'Jan 29', clicks: 72 },
  { date: 'Jan 30', clicks: 58 },
  { date: 'Jan 31', clicks: 81 },
  { date: 'Feb 1', clicks: 94 },
  { date: 'Feb 2', clicks: 76 },
  { date: 'Feb 3', clicks: 63 },
  { date: 'Feb 4', clicks: 88 },
  { date: 'Feb 5', clicks: 105 },
  { date: 'Feb 6', clicks: 92 },
  { date: 'Feb 7', clicks: 78 },
  { date: 'Feb 8', clicks: 113 },
  { date: 'Feb 9', clicks: 127 },
  { date: 'Feb 10', clicks: 98 },
  { date: 'Feb 11', clicks: 85 },
  { date: 'Feb 12', clicks: 134 },
  { date: 'Feb 13', clicks: 142 },
  { date: 'Feb 14', clicks: 156 },
  { date: 'Feb 15', clicks: 118 },
  { date: 'Feb 16', clicks: 103 },
  { date: 'Feb 17', clicks: 165 },
  { date: 'Feb 18', clicks: 148 },
  { date: 'Feb 19', clicks: 171 },
];

export const ANALYTICS_SUMMARY = {
  totalClicks: 2_841,
  uniqueVisitors: 1_923,
  topPlatform: 'Spotify',
  topCountry: 'United States',
  clickGrowth: 23, // percent
} as const;

export interface PlatformClicks {
  platform: string;
  clicks: number;
  color: string;
}

export const PLATFORM_CLICKS: PlatformClicks[] = [
  { platform: 'Spotify', clicks: 1_126, color: '#1DB954' },
  { platform: 'Apple Music', clicks: 684, color: '#FA2D48' },
  { platform: 'YouTube', clicks: 412, color: '#FF0000' },
  { platform: 'Instagram', clicks: 328, color: '#E1306C' },
  { platform: 'TikTok', clicks: 291, color: '#010101' },
];

// ── Audience ─────────────────────────────────────────────────────────────────

export interface AudienceMember {
  id: string;
  name: string;
  intent: 'High' | 'Medium' | 'Low';
  status: 'Returning' | 'New';
  source: string;
  lastAction: string;
  engagementScore: number;
}

export const AUDIENCE_MEMBERS: AudienceMember[] = [
  {
    id: '1',
    name: 'alex.rivera@gmail.com',
    intent: 'High',
    status: 'Returning',
    source: 'Instagram',
    lastAction: 'Played Signals',
    engagementScore: 92,
  },
  {
    id: '2',
    name: 'jordan_beats',
    intent: 'High',
    status: 'New',
    source: 'Twitter',
    lastAction: 'Subscribed',
    engagementScore: 85,
  },
  {
    id: '3',
    name: 'maya.chen@outlook.com',
    intent: 'Medium',
    status: 'Returning',
    source: 'Spotify',
    lastAction: 'Saved The Sound',
    engagementScore: 71,
  },
  {
    id: '4',
    name: 'sam_music_fan',
    intent: 'High',
    status: 'Returning',
    source: 'TikTok',
    lastAction: 'Tipped $5',
    engagementScore: 96,
  },
  {
    id: '5',
    name: 'olivia.k@hey.com',
    intent: 'Medium',
    status: 'New',
    source: 'Google',
    lastAction: 'Viewed profile',
    engagementScore: 54,
  },
  {
    id: '6',
    name: 'dj_night_owl',
    intent: 'Low',
    status: 'New',
    source: 'Direct',
    lastAction: 'Clicked Apple Music',
    engagementScore: 28,
  },
  {
    id: '7',
    name: 'lena.park@icloud.com',
    intent: 'High',
    status: 'Returning',
    source: 'Instagram',
    lastAction: 'Shared profile',
    engagementScore: 88,
  },
];

export const AUDIENCE_SUMMARY = {
  totalSubscribers: 847,
  emailSubscribers: 623,
  smsSubscribers: 224,
  subscriberGrowth: 18, // percent this month
} as const;

// ── Earnings ─────────────────────────────────────────────────────────────────

export interface MonthlyEarnings {
  month: string;
  amount: number; // cents
}

export const MONTHLY_EARNINGS: MonthlyEarnings[] = [
  { month: 'Sep', amount: 12_50 },
  { month: 'Oct', amount: 28_00 },
  { month: 'Nov', amount: 18_50 },
  { month: 'Dec', amount: 42_00 },
  { month: 'Jan', amount: 35_75 },
  { month: 'Feb', amount: 48_50 },
];

export interface RecentTip {
  id: string;
  donor: string;
  amount: string;
  message: string;
  time: string;
}

export const RECENT_TIPS: RecentTip[] = [
  {
    id: '1',
    donor: 'Sam K.',
    amount: '$5.00',
    message: 'Love the new album!',
    time: '2h ago',
  },
  {
    id: '2',
    donor: 'Anonymous',
    amount: '$10.00',
    message: 'Signals is incredible',
    time: '5h ago',
  },
  {
    id: '3',
    donor: 'Jordan B.',
    amount: '$3.00',
    message: 'Keep creating 🎵',
    time: '1d ago',
  },
  {
    id: '4',
    donor: 'Lena P.',
    amount: '$15.00',
    message: 'See you in Brooklyn!',
    time: '2d ago',
  },
  { id: '5', donor: 'Alex R.', amount: '$7.50', message: '', time: '3d ago' },
];

export const EARNINGS_SUMMARY = {
  totalReceivedCents: 235_00,
  monthReceivedCents: 48_50,
  tipsSubmitted: 47,
  tipClicks: 342,
  qrTipClicks: 89,
  linkTipClicks: 253,
} as const;

// ── Releases ─────────────────────────────────────────────────────────────────

export interface DemoRelease {
  id: string;
  title: string;
  type: 'Single' | 'EP' | 'Album';
  date: string;
  trackCount: number;
  hasSmartLink: boolean;
  gradient: string;
  platforms: string[];
}

export const RELEASES: DemoRelease[] = [
  {
    id: '1',
    title: 'Signals',
    type: 'Album',
    date: 'Feb 2024',
    trackCount: 12,
    hasSmartLink: true,
    gradient: 'linear-gradient(135deg, #2a1f3d, #4a2d6b)',
    platforms: ['Spotify', 'Apple Music', 'YouTube Music', 'Tidal'],
  },
  {
    id: '2',
    title: 'Neon Nights',
    type: 'EP',
    date: 'Oct 2023',
    trackCount: 5,
    hasSmartLink: true,
    gradient: 'linear-gradient(135deg, #1a2a3a, #2d4a5a)',
    platforms: ['Spotify', 'Apple Music', 'YouTube Music'],
  },
  {
    id: '3',
    title: 'The Sound',
    type: 'Single',
    date: 'Mar 2023',
    trackCount: 1,
    hasSmartLink: true,
    gradient: 'linear-gradient(135deg, #3a1a1a, #6b2d2d)',
    platforms: ['Spotify', 'Apple Music'],
  },
  {
    id: '4',
    title: 'Quiet Hours',
    type: 'EP',
    date: 'Aug 2022',
    trackCount: 4,
    hasSmartLink: false,
    gradient: 'linear-gradient(135deg, #1a3a2a, #2d5a4a)',
    platforms: ['Spotify', 'Apple Music', 'SoundCloud'],
  },
  {
    id: '5',
    title: 'First Light',
    type: 'Single',
    date: 'Jan 2022',
    trackCount: 1,
    hasSmartLink: false,
    gradient: 'linear-gradient(135deg, #3a3a1a, #5a5a2d)',
    platforms: ['Spotify'],
  },
];

// ── Links ────────────────────────────────────────────────────────────────────

export interface DemoLink {
  id: string;
  platform: string;
  type: 'music' | 'social';
  url: string;
  clicks: number;
  active: boolean;
  icon: string; // emoji placeholder
}

export const LINKS: DemoLink[] = [
  {
    id: '1',
    platform: 'Spotify',
    type: 'music',
    url: 'open.spotify.com/artist/timwhite',
    clicks: 1_126,
    active: true,
    icon: '🎵',
  },
  {
    id: '2',
    platform: 'Apple Music',
    type: 'music',
    url: 'music.apple.com/artist/timwhite',
    clicks: 684,
    active: true,
    icon: '🎵',
  },
  {
    id: '3',
    platform: 'YouTube Music',
    type: 'music',
    url: 'music.youtube.com/timwhite',
    clicks: 412,
    active: true,
    icon: '🎵',
  },
  {
    id: '4',
    platform: 'Instagram',
    type: 'social',
    url: 'instagram.com/timwhitemusic',
    clicks: 328,
    active: true,
    icon: '📸',
  },
  {
    id: '5',
    platform: 'TikTok',
    type: 'social',
    url: 'tiktok.com/@timwhitemusic',
    clicks: 291,
    active: true,
    icon: '🎬',
  },
  {
    id: '6',
    platform: 'Twitter',
    type: 'social',
    url: 'twitter.com/timwhitemusic',
    clicks: 156,
    active: true,
    icon: '🐦',
  },
  {
    id: '7',
    platform: 'SoundCloud',
    type: 'music',
    url: 'soundcloud.com/timwhitemusic',
    clicks: 89,
    active: false,
    icon: '☁️',
  },
];
