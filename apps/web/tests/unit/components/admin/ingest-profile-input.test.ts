import { describe, expect, it } from 'vitest';
import { mapProfileToContact } from '@/components/admin/admin-creator-profiles/utils';
import { getNormalizedInputUrl } from '@/components/admin/ingest-profile-dropdown/useIngestProfile';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';

describe('ingest profile input normalization', () => {
  it('normalizes bare instagram handles using selected network preset', () => {
    const normalized = getNormalizedInputUrl('instagram', 'timwhite');
    expect(normalized).toBe('https://instagram.com/timwhite');
  });

  it('accepts URLs without protocol and fixes network base typos', () => {
    const normalized = getNormalizedInputUrl(
      'instagram',
      'instagran.com/timwhite'
    );
    expect(normalized).toBe('https://instagram.com/timwhite');
  });

  it('builds spotify artist URLs from artist id input', () => {
    const normalized = getNormalizedInputUrl(
      'spotify',
      '2RdwBSPQiwcmiDo9kixcl8'
    );
    expect(normalized).toBe(
      'https://open.spotify.com/artist/2RdwBSPQiwcmiDo9kixcl8'
    );
  });
});

describe('mapProfileToContact', () => {
  it('hydrates sidebar social links from table row data', () => {
    const row: AdminCreatorProfileRow = {
      id: 'profile-1',
      username: 'timwhite',
      usernameNormalized: 'timwhite',
      avatarUrl: null,
      displayName: 'Tim White',
      isVerified: false,
      isFeatured: false,
      marketingOptOut: false,
      isClaimed: false,
      claimToken: null,
      claimTokenExpiresAt: null,
      userId: null,
      createdAt: null,
      ingestionStatus: 'idle',
      lastIngestionError: null,
      socialLinks: [
        {
          id: 'link-1',
          platform: 'instagram',
          platformType: 'instagram',
          url: 'https://instagram.com/timwhite',
          displayText: 'Instagram',
        },
      ],
    };

    const contact = mapProfileToContact(row);

    expect(contact?.socialLinks).toEqual([
      {
        id: 'link-1',
        label: 'Instagram',
        url: 'https://instagram.com/timwhite',
        platformType: 'instagram',
      },
    ]);
  });
});
