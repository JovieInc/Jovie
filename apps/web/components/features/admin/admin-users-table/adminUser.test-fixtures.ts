import type { AdminUserRow } from '@/lib/admin/types';

/**
 * Admin user rows shared by the AdminUserDetailDrawer certificate test and
 * state stories. Dates are fixed so every render is deterministic.
 */
export const adminUser: AdminUserRow = {
  id: 'user-1',
  clerkId: 'clerk-1',
  name: 'Alex Rivera',
  email: 'alex@example.com',
  userStatus: 'active',
  createdAt: new Date('2026-07-01T12:00:00Z'),
  deletedAt: null,
  isPro: true,
  stripeCustomerId: 'cus_123',
  stripeSubscriptionId: null,
  plan: 'pro',
  profileUsername: 'alex',
  founderWelcomeSentAt: null,
  welcomeFailedAt: null,
  outboundSuppressedAt: null,
  suppressionFailedAt: null,
  profileCreatedAt: new Date('2026-07-01T12:00:00Z'),
  profileOrigin: 'onboarding',
  socialLinks: [
    {
      id: 'link-1',
      platform: 'spotify',
      platformType: 'dsp',
      url: 'https://open.spotify.com/artist/alex',
      displayText: 'Spotify',
    },
    {
      id: 'link-2',
      platform: 'apple_music',
      platformType: 'dsp',
      url: 'https://music.apple.com/artist/alex',
      displayText: null,
    },
  ],
};

export const longContentUser: AdminUserRow = {
  ...adminUser,
  id: 'user-0f9b2c4e-8d1a-4a7e-9c3b-5e6f7a8b9c0d-with-a-very-long-suffix',
  clerkId: 'user_2xQ9mN4pR7sT1vW3yZ5aB8cD0eF6gH2jK4lM6nP8qR0sT2vW4',
  name: 'Maximiliana Alexandra Constantinopoulou-Wolfeschlegelsteinhausen',
  email:
    'maximiliana.alexandra.constantinopoulou.management.team@an-unusually-long-label-domain.example.com',
  stripeCustomerId: 'cus_ThisIsAnExtremelyLongStripeCustomerIdentifier1234',
  stripeSubscriptionId: 'sub_1234567890',
  plan: 'free',
  isPro: false,
  deletedAt: new Date('2026-08-15T09:30:00Z'),
  profileUsername:
    'maximiliana-alexandra-constantinopoulou-official-artist-profile',
  socialLinks: Array.from({ length: 10 }, (_, index) => ({
    id: `long-link-${index}`,
    platform: 'youtube_music',
    platformType: 'dsp',
    url: `https://music.youtube.com/channel/long-${index}`,
    displayText: `A very long destination label for streaming channel number ${index + 1}`,
  })),
};

export const rtlUser: AdminUserRow = {
  ...adminUser,
  id: 'user-rtl',
  name: 'ليلى حداد',
  email: 'layla@example.com',
  profileUsername: 'layla',
  socialLinks: [
    {
      id: 'rtl-link-1',
      platform: 'spotify',
      platformType: 'dsp',
      url: 'https://open.spotify.com/artist/layla',
      displayText: 'سبوتيفاي',
    },
  ],
};
