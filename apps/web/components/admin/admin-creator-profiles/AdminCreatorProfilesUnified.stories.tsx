import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import { AdminCreatorProfilesUnified } from './AdminCreatorProfilesUnified';

// Platform options for social links
const platforms = [
  { platform: 'instagram', platformType: 'social', prefix: '@' },
  { platform: 'tiktok', platformType: 'social', prefix: '@' },
  { platform: 'youtube', platformType: 'social', prefix: '@' },
  { platform: 'twitter', platformType: 'social', prefix: '@' },
  { platform: 'spotify', platformType: 'music', prefix: '' },
  { platform: 'apple_music', platformType: 'music', prefix: '' },
];

// Sample usernames for variety
const usernames = [
  'musiclover',
  'beatmaker',
  'songwriter',
  'producer',
  'artist',
  'performer',
  'vocalist',
  'guitarist',
  'drummer',
  'pianist',
  'djmix',
  'rapper',
  'singer',
  'composer',
  'musician',
];

// Sample display names
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
];

/**
 * Generates a large array of mock creator profiles for virtualization testing.
 * Uses deterministic pseudo-randomness based on index for consistent results.
 */
function generateMockProfiles(count: number): AdminCreatorProfileRow[] {
  const profiles: AdminCreatorProfileRow[] = [];

  for (let i = 0; i < count; i++) {
    // Use modular arithmetic for pseudo-random but deterministic selection
    const username = `${usernames[i % usernames.length]}${i}`;
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[(i * 7) % lastNames.length];
    const displayName = `${firstName} ${lastName}`;

    // Vary verification and claim status
    const isVerified = i % 10 === 0; // 10% verified
    const isClaimed = i % 3 !== 0; // ~67% claimed
    const isFeatured = i % 25 === 0; // 4% featured

    // Generate 2-4 social links per profile
    const linkCount = (i % 3) + 2;
    const socialLinks = Array.from({ length: linkCount }, (_, j) => {
      const platformData = platforms[(i + j) % platforms.length];
      return {
        id: `link-${i}-${j}`,
        platform: platformData.platform,
        platformType: platformData.platformType,
        url: `https://${platformData.platform}.com/${username}`,
        displayText: `${platformData.prefix}${username}`,
      };
    });

    // Ingestion status variety
    const statusOptions: ('idle' | 'pending' | 'processing' | 'failed')[] = [
      'idle',
      'idle',
      'idle',
      'pending',
      'processing',
      'failed',
    ];
    const ingestionStatus = statusOptions[i % statusOptions.length];

    // Calculate days ago for createdAt
    const daysAgo = Math.floor((i * 17) % 365);
    const createdAt = new Date(Date.now() - daysAgo * 86400000);

    profiles.push({
      id: `profile-virt-${i}`,
      username,
      usernameNormalized: username.toLowerCase(),
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
      displayName,
      isVerified,
      isFeatured,
      marketingOptOut: i % 20 === 0, // 5% opted out
      isClaimed,
      claimToken: isClaimed ? null : `claim-token-${i}`,
      claimTokenExpiresAt: isClaimed
        ? null
        : new Date(Date.now() + 30 * 86400000),
      userId: isClaimed ? `user-${i}` : null,
      createdAt,
      confidence: Math.floor((i * 23) % 100) / 100, // 0.00-0.99
      ingestionStatus,
      lastIngestionError:
        ingestionStatus === 'failed'
          ? 'Failed to fetch profile data from Instagram API'
          : null,
      socialLinks,
    });
  }

  return profiles;
}

// Small dataset for basic stories
const mockProfiles = generateMockProfiles(15);

// Large dataset for virtualization testing
const largeProfileSet = generateMockProfiles(550);

const meta: Meta<typeof AdminCreatorProfilesUnified> = {
  title: 'Admin/Tables/CreatorProfiles',
  component: AdminCreatorProfilesUnified,
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
  tags: ['autodocs', 'creators-a11y'],
  decorators: [
    Story => (
      <div className='h-[800px] bg-base text-primary-token'>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default light mode with 15 creator profiles.
 */
export const Default: Story = {
  args: {
    profiles: mockProfiles,
    page: 1,
    pageSize: 20,
    total: mockProfiles.length,
    search: '',
    sort: 'created_desc',
  },
  parameters: {
    backgrounds: { default: 'light' },
  },
};

/**
 * Dark mode variant.
 */
export const DarkMode: Story = {
  args: {
    profiles: mockProfiles,
    page: 1,
    pageSize: 20,
    total: mockProfiles.length,
    search: '',
    sort: 'created_desc',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

/**
 * Verified creators only (filtered view).
 */
export const VerifiedCreators: Story = {
  args: {
    profiles: mockProfiles.filter(p => p.isVerified),
    page: 1,
    pageSize: 20,
    total: mockProfiles.filter(p => p.isVerified).length,
    search: '',
    sort: 'verified_desc',
  },
  parameters: {
    backgrounds: { default: 'light' },
  },
};

/**
 * Featured creators view.
 */
export const FeaturedCreators: Story = {
  args: {
    profiles: mockProfiles.filter(p => p.isFeatured),
    page: 1,
    pageSize: 20,
    total: mockProfiles.filter(p => p.isFeatured).length,
    search: '',
    sort: 'created_desc',
  },
  parameters: {
    backgrounds: { default: 'light' },
  },
};

/**
 * **Virtualization Performance Demo**
 *
 * This story demonstrates the virtualization feature with 550 creator profiles.
 * Open your browser's DevTools → Elements panel to verify:
 *
 * 1. **DOM Efficiency**: Only ~15-20 `<tr>` elements should be rendered in the
 *    tbody at any time, not 550+. Scroll to see rows being recycled.
 *
 * 2. **Smooth Scrolling**: Scroll the table quickly - it should remain smooth
 *    at 60fps without frame drops because we're not rendering 550 rows.
 *
 * 3. **Memory Usage**: Memory profile should stay flat despite large dataset.
 *
 * 4. **Absolute Positioning**: Each visible row uses `position: absolute` with
 *    `translateY` to position itself correctly within the virtualized container.
 *
 * The `@tanstack/react-virtual` virtualizer handles row recycling with:
 * - Estimated row height: 52px
 * - Overscan: 5 rows above/below viewport
 * - Auto-enable threshold: 20+ rows
 *
 * **Performance Targets**:
 * - Initial render: <100ms
 * - Scroll FPS: 60fps
 * - Row selection: <10ms
 */
export const VirtualizationDemo: Story = {
  args: {
    profiles: largeProfileSet,
    page: 1,
    pageSize: largeProfileSet.length, // Show all at once to demo virtualization
    total: largeProfileSet.length,
    search: '',
    sort: 'created_desc',
  },
  parameters: {
    backgrounds: { default: 'light' },
    docs: {
      description: {
        story:
          'Demonstrates virtualization performance with 550 creator profiles. Open DevTools to verify only visible rows (~15-20) are rendered. Table should scroll smoothly at 60fps.',
      },
    },
  },
};

/**
 * Virtualization demo in dark mode.
 */
export const VirtualizationDemoDark: Story = {
  args: {
    profiles: largeProfileSet,
    page: 1,
    pageSize: largeProfileSet.length,
    total: largeProfileSet.length,
    search: '',
    sort: 'created_desc',
  },
  parameters: {
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        story:
          'Dark mode variant of the virtualization demo with 550 creator profiles.',
      },
    },
  },
};

/**
 * Empty state when no creators match search/filters.
 */
export const EmptyState: Story = {
  args: {
    profiles: [],
    page: 1,
    pageSize: 20,
    total: 0,
    search: 'nonexistent-creator',
    sort: 'created_desc',
  },
  parameters: {
    backgrounds: { default: 'light' },
  },
};

/**
 * Loading state skeleton (simulated).
 */
export const LoadingState: Story = {
  args: {
    profiles: [],
    page: 1,
    pageSize: 20,
    total: 0,
    search: '',
    sort: 'created_desc',
  },
  parameters: {
    backgrounds: { default: 'light' },
  },
};

/**
 * Profiles with ingestion errors.
 */
export const WithIngestionErrors: Story = {
  args: {
    profiles: mockProfiles.filter(p => p.ingestionStatus === 'failed'),
    page: 1,
    pageSize: 20,
    total: mockProfiles.filter(p => p.ingestionStatus === 'failed').length,
    search: '',
    sort: 'created_desc',
  },
  parameters: {
    backgrounds: { default: 'light' },
  },
};
