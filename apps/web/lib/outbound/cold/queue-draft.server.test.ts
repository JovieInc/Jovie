import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutboundLeadFacts } from '../queue';

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  releases: vi.fn(),
  links: vi.fn(),
  suppression: vi.fn(),
  unsubscribe: vi.fn(),
  contacts: vi.fn(),
  contact: vi.fn(),
  inspection: vi.fn(),
  policy: vi.fn(),
  domain: vi.fn(),
  sender: vi.fn(),
}));
vi.mock('@/lib/admin/contacts', () => ({
  getCanonicalContactByKey: mocks.contact,
  getCanonicalContactsByKeys: mocks.contacts,
}));
vi.mock('@/lib/admin/contact-certification', () => ({
  getContactCertificationInspection: mocks.inspection,
}));
vi.mock('@/lib/db', () => ({
  db: { query: { emailSuppressions: { findFirst: mocks.suppression } } },
}));
vi.mock('@/lib/discography/queries', () => ({
  getReleasesForProfileLite: mocks.releases,
}));
vi.mock('@/lib/services/profile/queries', () => ({
  getProfileByUsername: mocks.profile,
  getProfileSocialLinks: mocks.links,
}));
vi.mock('@/lib/notifications/suppression', () => ({
  hashEmail: (email: string) => `synthetic-hash:${email}`,
}));
vi.mock('@/lib/email/unsubscribe-token', () => ({
  buildClaimInviteUnsubscribeUrl: mocks.unsubscribe,
}));
vi.mock('@/lib/email/streams', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/email/streams')>()),
  streamPolicy: mocks.policy,
  getStreamDomain: mocks.domain,
  streamFromEmail: mocks.sender,
}));

import {
  createColdQueueDraftContextReader,
  readColdQueueDraftContext,
} from './queue-draft.server';

const facts = {
  certified: true,
  creatorProfileId: 'profile-1',
  profileUsername: 'synthetic-artist',
  claimToken: 'synthetic/token',
  contactEmail: 'ARTIST@example.com',
} as OutboundLeadFacts;

describe('cold queue draft source boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv(
      'LEGAL_MAILING_ADDRESS',
      '123 Example St, Example City, CA 90012'
    );
    mocks.policy.mockReturnValue({
      status: 'open',
      defaultFromName: 'Tim White',
    });
    mocks.domain.mockReturnValue('outreach.example.com');
    mocks.sender.mockReturnValue('tim@outreach.example.com');
    mocks.unsubscribe.mockReturnValue(
      'https://jov.ie/api/unsubscribe/claim-invites?token=synthetic'
    );
    mocks.suppression.mockResolvedValue(undefined);
    mocks.contact.mockResolvedValue({
      creatorProfileId: 'profile-1',
      email: 'artist@example.com',
      displayName: 'Catalog Artist',
    });
    mocks.inspection.mockResolvedValue({
      status: 'certified_for_outreach',
      canCertify: true,
      items: [
        { key: 'canonical:display-name', value: 'Catalog Artist' },
        { key: 'canonical:email', value: 'artist@example.com' },
        { key: 'release:r1', value: 'Synthetic Release', decision: null },
        { key: 'release:r2', value: 'Older Release', decision: null },
        { category: 'dsp', url: 'https://open.spotify.com/artist/synthetic' },
        { category: 'dsp', url: 'https://music.apple.com/synthetic' },
      ],
    });
    mocks.profile.mockResolvedValue({
      id: 'profile-1',
      displayName: 'Catalog Artist',
    });
    mocks.releases.mockResolvedValue([
      {
        id: 'r1',
        title: 'Synthetic Release',
        releaseDate: '2026-10-01T00:00:00.000Z',
      },
      { id: 'r2', title: 'Older Release', releaseDate: null },
    ]);
    mocks.links.mockResolvedValue([
      { platform: 'spotify', url: 'https://open.spotify.com/artist/synthetic' },
      { platform: 'spotify', url: 'https://open.spotify.com/artist/synthetic' },
      { platform: 'apple_music', url: 'https://music.apple.com/synthetic' },
      { platform: 'instagram', url: 'https://instagram.com/synthetic' },
    ]);
  });
  it('derives counts from the public page projections and never guesses a first name', async () => {
    const result = await readColdQueueDraftContext(
      facts,
      new Date('2026-10-04T12:00:00Z')
    );
    expect(result).toMatchObject({
      profileId: 'profile-1',
      recipientEmail: 'artist@example.com',
      artifact: {
        artistName: 'Catalog Artist',
        firstName: null,
        releaseCount: 2,
        platformCount: 2,
        latestRelease: { title: 'Synthetic Release', releasedOn: '2026-10-01' },
      },
      compliance: { suppressed: false, isFollowUp: false },
    });
    expect(result?.artifact.claimUrl).toContain(
      '/claim/synthetic%2Ftoken?utm_source=claim_link'
    );
    expect(mocks.releases).toHaveBeenCalledWith('profile-1');
    expect(mocks.links).toHaveBeenCalledWith('profile-1');
    expect(mocks.unsubscribe).toHaveBeenCalledWith('artist@example.com');
  });
  it.each([
    'uncertified',
    'closed',
    'domain',
    'core',
    'sender',
    'address',
    'unsubscribe',
    'profile',
    'catalog-error',
    'suppression-error',
    'stale-certification',
    'rejected-email',
    'rejected-release',
    'uncertified-links',
  ])('fails closed for unavailable %s input', async failure => {
    if (failure === 'stale-certification')
      mocks.inspection.mockResolvedValue({
        status: 'stale',
        canCertify: false,
        items: [],
      });
    if (failure === 'rejected-email' || failure === 'rejected-release') {
      const inspection = await mocks.inspection();
      const key =
        failure === 'rejected-email' ? 'canonical:email' : 'release:r1';
      mocks.inspection.mockResolvedValue({
        ...inspection,
        items: inspection.items.map((item: { key: string }) =>
          item.key === key ? { ...item, decision: 'no' } : item
        ),
      });
    }
    if (failure === 'uncertified-links')
      mocks.links.mockResolvedValue([
        { platform: 'spotify', url: 'https://open.spotify.com/artist/unknown' },
      ]);
    if (failure === 'closed')
      mocks.policy.mockReturnValue({
        status: 'closed',
        defaultFromName: 'Tim White',
      });
    if (failure === 'domain') mocks.domain.mockReturnValue(null);
    if (failure === 'core') mocks.domain.mockReturnValue('out.jov.ie');
    if (failure === 'sender') mocks.sender.mockReturnValue(null);
    if (failure === 'address') vi.stubEnv('LEGAL_MAILING_ADDRESS', '');
    if (failure === 'unsubscribe') mocks.unsubscribe.mockReturnValue(null);
    if (failure === 'profile')
      mocks.profile.mockResolvedValue({
        id: 'wrong-profile',
        displayName: 'Wrong',
      });
    if (failure === 'catalog-error')
      mocks.releases.mockRejectedValueOnce(new Error('unavailable'));
    if (failure === 'suppression-error')
      mocks.suppression.mockRejectedValueOnce(new Error('unavailable'));
    expect(
      await readColdQueueDraftContext(
        { ...facts, certified: failure !== 'uncertified' },
        new Date('2026-10-04T12:00:00Z')
      )
    ).toBeNull();
  });
  it('shares one lazy canonical CRM snapshot across concurrent queue rows', async () => {
    const key = 'email:artist@example.com';
    mocks.contacts.mockResolvedValue(
      new Map([
        [
          key,
          {
            creatorProfileId: 'profile-1',
            email: 'artist@example.com',
            displayName: 'Catalog Artist',
          },
        ],
      ])
    );
    const read = createColdQueueDraftContextReader([key]);
    expect(mocks.contacts).not.toHaveBeenCalled();
    const results = await Promise.all([
      read(facts, new Date('2026-10-04T12:00:00Z')),
      read(facts, new Date('2026-10-04T12:00:00Z')),
    ]);
    expect(results.every(Boolean)).toBe(true);
    expect(mocks.contacts).toHaveBeenCalledTimes(1);
    expect(mocks.contact).not.toHaveBeenCalled();
  });

  it('does not treat an expired suppression as permission for cold mail', async () => {
    mocks.suppression.mockResolvedValue({
      expiresAt: new Date('2020-01-01T00:00:00Z'),
    });
    expect(
      (await readColdQueueDraftContext(facts, new Date('2026-10-04T12:00:00Z')))
        ?.compliance.suppressed
    ).toBe(true);
  });
});
