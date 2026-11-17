import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import type { UnclaimedIdentityEnrichmentReceipt } from '@/lib/profile/unclaimed-artist-profile';
import type { Contact } from '@/types';

/** Shared fixtures for the AdminProfileSidebar state stories and tests. */
export const sidebarProfile = {
  id: 'profile-1',
  username: 'alice',
  usernameNormalized: 'alice',
  avatarUrl: null,
  displayName: 'Alice',
  bio: 'Indie pop artist',
  genres: ['Pop'],
  isVerified: false,
  isFeatured: false,
  marketingOptOut: false,
  isClaimed: true,
  claimToken: null,
  claimTokenExpiresAt: null,
  userId: 'user-1',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  ingestionStatus: 'idle',
  lastIngestionError: null,
  location: null,
  hometown: null,
  activeSinceYear: null,
  socialLinks: [
    {
      id: 'link-1',
      platform: 'instagram',
      platformType: 'instagram',
      url: 'https://instagram.com/alice',
      displayText: '@alice',
    },
  ],
} as AdminCreatorProfileRow;

export const sidebarContact: Contact = {
  id: 'profile-1',
  username: 'alice',
  displayName: 'Alice',
  avatarUrl: null,
  socialLinks: [
    {
      id: 'link-1',
      label: 'Instagram',
      platformType: 'instagram',
      url: 'https://instagram.com/alice',
    },
  ],
};

/** A partial enrichment: one source verified, one conflict, not share-ready. */
export const partialEnrichment: UnclaimedIdentityEnrichmentReceipt = {
  status: 'partial',
  observedAt: '2026-10-01T12:00:00.000Z',
  shareReady: false,
  linkCount: 2,
  verifiedCount: 1,
  sources: { musicfetch: 'verified', musicbrainz: 'not_found' },
  conflicts: [
    {
      platform: 'instagram',
      urls: [
        'https://instagram.com/alice',
        'https://instagram.com/alice.music',
      ],
      sources: ['musicfetch', 'musicbrainz'],
    },
  ],
};
