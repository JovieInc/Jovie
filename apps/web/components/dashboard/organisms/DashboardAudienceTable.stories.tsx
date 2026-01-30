import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import DashboardLayoutClient from '@/app/app/(shell)/dashboard/DashboardLayoutClient';
import type { AudienceMember } from '@/types';
import { DashboardAudienceTable } from './dashboard-audience-table';

const mockDashboardData: DashboardData = {
  user: { id: 'story-user' },
  creatorProfiles: [],
  selectedProfile: null,
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: true,
  hasMusicLinks: false,
  isAdmin: false,
  tippingStats: {
    tipClicks: 0,
    qrTipClicks: 0,
    linkTipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
};

const mockMembers: AudienceMember[] = [
  {
    id: 'aud-1',
    type: 'email',
    displayName: 'Sasha Fan',
    locationLabel: 'Los Angeles, US',
    geoCity: 'Los Angeles',
    geoCountry: 'US',
    visits: 12,
    engagementScore: 87,
    intentLevel: 'high',
    latestActions: [
      { label: 'Visited profile', timestamp: new Date().toISOString() },
      { label: 'Clicked link', timestamp: new Date().toISOString() },
      { label: 'Subscribed', timestamp: new Date().toISOString() },
    ],
    referrerHistory: [
      { url: 'https://instagram.com', timestamp: new Date().toISOString() },
      { url: 'https://tiktok.com', timestamp: new Date().toISOString() },
    ],
    email: 'sasha@example.com',
    phone: null,
    spotifyConnected: false,
    purchaseCount: 0,
    tags: ['superfan'],
    deviceType: 'mobile',
    lastSeenAt: new Date().toISOString(),
  },
  {
    id: 'aud-2',
    type: 'anonymous',
    displayName: null,
    locationLabel: 'Unknown',
    geoCity: null,
    geoCountry: null,
    visits: 3,
    engagementScore: 22,
    intentLevel: 'low',
    latestActions: [
      { label: 'Visited profile', timestamp: new Date().toISOString() },
    ],
    referrerHistory: [],
    email: null,
    phone: null,
    spotifyConnected: false,
    purchaseCount: 0,
    tags: [],
    deviceType: 'desktop',
    lastSeenAt: new Date().toISOString(),
  },
  {
    id: 'aud-3',
    type: 'sms',
    displayName: 'Text Fan',
    locationLabel: 'Austin, US',
    geoCity: 'Austin',
    geoCountry: 'US',
    visits: 7,
    engagementScore: 55,
    intentLevel: 'medium',
    latestActions: [
      { label: 'Subscribed', timestamp: new Date().toISOString() },
      { label: 'Visited profile', timestamp: new Date().toISOString() },
    ],
    referrerHistory: [
      { url: 'https://youtube.com', timestamp: new Date().toISOString() },
    ],
    email: null,
    phone: '+15555555555',
    spotifyConnected: false,
    purchaseCount: 0,
    tags: ['sms'],
    deviceType: 'mobile',
    lastSeenAt: new Date().toISOString(),
  },
];

const meta: Meta<typeof DashboardAudienceTable> = {
  title: 'Dashboard/Organisms/DashboardAudienceTable',
  component: DashboardAudienceTable,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#0D0E12' },
      ],
    },
    a11y: {
      config: {
        rules: [
          {
            id: 'color-contrast',
            enabled: true,
          },
        ],
      },
    },
  },
  tags: ['autodocs', 'audience-a11y'],
  decorators: [
    Story => (
      <DashboardDataProvider value={mockDashboardData}>
        <DashboardLayoutClient dashboardData={mockDashboardData}>
          <div className='h-[720px] bg-surface-1 text-primary-token'>
            <Story />
          </div>
        </DashboardLayoutClient>
      </DashboardDataProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const MembersLight: Story = {
  args: {
    mode: 'members',
    rows: mockMembers,
    total: 42,
    page: 1,
    pageSize: 10,
    sort: 'lastSeen',
    direction: 'desc',
    onPageChange: () => {},
    onPageSizeChange: () => {},
    onSortChange: () => {},
  },
  parameters: {
    backgrounds: { default: 'light' },
  },
};

export const MembersDark: Story = {
  args: {
    mode: 'members',
    rows: mockMembers,
    total: 42,
    page: 1,
    pageSize: 10,
    sort: 'lastSeen',
    direction: 'desc',
    onPageChange: () => {},
    onPageSizeChange: () => {},
    onSortChange: () => {},
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

export const SubscribersLight: Story = {
  args: {
    mode: 'subscribers',
    rows: mockMembers.map(member => ({
      ...member,
      type: member.email ? 'email' : 'sms',
    })),
    total: 12,
    page: 1,
    pageSize: 10,
    sort: 'createdAt',
    direction: 'desc',
    onPageChange: () => {},
    onPageSizeChange: () => {},
    onSortChange: () => {},
  },
  parameters: {
    backgrounds: { default: 'light' },
  },
};

export const SubscribersDark: Story = {
  args: {
    mode: 'subscribers',
    rows: mockMembers.map(member => ({
      ...member,
      type: member.email ? 'email' : 'sms',
    })),
    total: 12,
    page: 1,
    pageSize: 10,
    sort: 'createdAt',
    direction: 'desc',
    onPageChange: () => {},
    onPageSizeChange: () => {},
    onSortChange: () => {},
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

// Cities and countries for diverse data generation
const cities = [
  { city: 'New York', country: 'US' },
  { city: 'Los Angeles', country: 'US' },
  { city: 'Chicago', country: 'US' },
  { city: 'London', country: 'GB' },
  { city: 'Paris', country: 'FR' },
  { city: 'Berlin', country: 'DE' },
  { city: 'Tokyo', country: 'JP' },
  { city: 'Sydney', country: 'AU' },
  { city: 'Toronto', country: 'CA' },
  { city: 'São Paulo', country: 'BR' },
  { city: 'Mumbai', country: 'IN' },
  { city: 'Seoul', country: 'KR' },
  { city: 'Mexico City', country: 'MX' },
  { city: 'Amsterdam', country: 'NL' },
  { city: 'Stockholm', country: 'SE' },
];

const firstNames = [
  'Alex',
  'Jordan',
  'Taylor',
  'Morgan',
  'Casey',
  'Riley',
  'Avery',
  'Quinn',
  'Reese',
  'Finley',
  'Charlie',
  'Emery',
  'Skyler',
  'Dakota',
  'Hayden',
];

const lastNames = [
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Garcia',
  'Miller',
  'Davis',
  'Rodriguez',
  'Martinez',
  'Anderson',
  'Taylor',
  'Thomas',
  'Moore',
  'Jackson',
];

const actionLabels = [
  'Visited profile',
  'Clicked link',
  'Subscribed',
  'Tipped',
  'Viewed release',
  'Followed on Spotify',
  'Purchased merch',
];

/**
 * Generates a large array of mock audience members for virtualization testing.
 * Uses deterministic pseudo-randomness based on index for consistent results.
 */
function generateMockMembers(count: number): AudienceMember[] {
  const members: AudienceMember[] = [];

  for (let i = 0; i < count; i++) {
    // Use modular arithmetic for pseudo-random but deterministic selection
    const cityData = cities[i % cities.length];
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[(i * 7) % lastNames.length];
    const intentLevels: ('high' | 'medium' | 'low')[] = [
      'high',
      'medium',
      'low',
    ];
    const intentLevel = intentLevels[i % 3];
    const memberTypes: ('email' | 'sms' | 'anonymous' | 'spotify')[] = [
      'email',
      'sms',
      'anonymous',
      'spotify',
    ];
    const type = memberTypes[i % 4];
    const deviceTypes = ['mobile', 'desktop', 'tablet'];
    const deviceType = deviceTypes[i % 3];

    // Generate 1-4 actions per member
    const actionCount = (i % 4) + 1;
    const latestActions = Array.from({ length: actionCount }, (_, j) => ({
      label: actionLabels[(i + j) % actionLabels.length],
      timestamp: new Date(Date.now() - j * 86400000).toISOString(), // Days ago
    }));

    // Generate 0-2 referrers
    const referrerCount = i % 3;
    const referrerDomains = [
      'https://instagram.com',
      'https://tiktok.com',
      'https://youtube.com',
      'https://twitter.com',
      'https://facebook.com',
    ];
    const referrerHistory = Array.from({ length: referrerCount }, (_, j) => ({
      url: referrerDomains[(i + j) % referrerDomains.length],
      timestamp: new Date(Date.now() - j * 86400000 * 7).toISOString(),
    }));

    const isAnonymous = type === 'anonymous';
    const displayName = isAnonymous ? null : `${firstName} ${lastName}`;
    const email =
      type === 'email' || type === 'spotify'
        ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`
        : null;
    const phone = type === 'sms' ? `+1555${String(i).padStart(7, '0')}` : null;

    members.push({
      id: `aud-virt-${i}`,
      type,
      displayName,
      locationLabel: isAnonymous
        ? 'Unknown'
        : `${cityData.city}, ${cityData.country}`,
      geoCity: isAnonymous ? null : cityData.city,
      geoCountry: isAnonymous ? null : cityData.country,
      visits: Math.floor((i * 17) % 100) + 1,
      engagementScore: Math.floor((i * 23) % 100),
      intentLevel,
      latestActions,
      referrerHistory,
      email,
      phone,
      spotifyConnected: type === 'spotify',
      purchaseCount: Math.floor((i * 3) % 5),
      tags: i % 5 === 0 ? ['superfan'] : i % 7 === 0 ? ['vip'] : [],
      deviceType,
      lastSeenAt: new Date(Date.now() - (i % 30) * 86400000).toISOString(),
    });
  }

  return members;
}

// Generate 500+ members for virtualization demo
const largeMemberSet = generateMockMembers(550);

/**
 * **Virtualization Performance Demo**
 *
 * This story demonstrates the virtualization feature with 550 audience members.
 * Open your browser's DevTools → Elements panel to verify:
 *
 * 1. **DOM Efficiency**: Only ~15-20 `<tr>` elements should be rendered in the
 *    tbody at any time, not 550+. Scroll to see rows being recycled.
 *
 * 2. **Smooth Scrolling**: Scroll the table quickly - it should remain smooth
 *    without frame drops because we're not rendering 550 rows.
 *
 * 3. **Memory Usage**: Memory profile should stay flat despite large dataset.
 *
 * 4. **Absolute Positioning**: Each visible row uses `position: absolute` with
 *    `translateY` to position itself correctly within the virtualized container.
 *
 * The `@tanstack/react-virtual` virtualizer handles row recycling with:
 * - Estimated row height: 60px
 * - Overscan: 5 rows above/below viewport
 */
export const VirtualizationDemo: Story = {
  args: {
    mode: 'members',
    rows: largeMemberSet,
    total: largeMemberSet.length,
    page: 1,
    pageSize: largeMemberSet.length, // Show all at once to demo virtualization
    sort: 'lastSeen',
    direction: 'desc',
    onPageChange: () => {},
    onPageSizeChange: () => {},
    onSortChange: () => {},
    profileUrl: 'https://jovie.link/demo',
  },
  parameters: {
    backgrounds: { default: 'light' },
    docs: {
      description: {
        story:
          'Demonstrates virtualization performance with 550 audience members. Open DevTools to verify only visible rows (~15-20) are rendered.',
      },
    },
  },
};

/**
 * Same virtualization demo in dark mode.
 */
export const VirtualizationDemoDark: Story = {
  args: {
    mode: 'members',
    rows: largeMemberSet,
    total: largeMemberSet.length,
    page: 1,
    pageSize: largeMemberSet.length,
    sort: 'lastSeen',
    direction: 'desc',
    onPageChange: () => {},
    onPageSizeChange: () => {},
    onSortChange: () => {},
    profileUrl: 'https://jovie.link/demo',
  },
  parameters: {
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        story:
          'Dark mode variant of the virtualization demo with 550 audience members.',
      },
    },
  },
};

/**
 * Virtualization demo in subscribers mode.
 */
export const VirtualizationSubscribers: Story = {
  args: {
    mode: 'subscribers',
    rows: largeMemberSet.map(member => ({
      ...member,
      type: member.email ? ('email' as const) : ('sms' as const),
    })),
    total: largeMemberSet.length,
    page: 1,
    pageSize: largeMemberSet.length,
    sort: 'createdAt',
    direction: 'desc',
    onPageChange: () => {},
    onPageSizeChange: () => {},
    onSortChange: () => {},
    profileUrl: 'https://jovie.link/demo',
  },
  parameters: {
    backgrounds: { default: 'light' },
    docs: {
      description: {
        story:
          'Virtualization demo for subscribers mode with 550 mock signups.',
      },
    },
  },
};
