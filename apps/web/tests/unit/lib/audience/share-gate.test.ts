import { describe, expect, it } from 'vitest';
import { getAudienceForExport } from '@/features/dashboard/organisms/dashboard-audience-table/utils/exportAudience';
import {
  applyShareGate,
  canShareContactOut,
  isSharedWithArtist,
  NO_SHARED_CONTACT_KEYS,
  redactUnsharedContact,
} from '@/lib/audience/share-gate';
import type { AudienceMember } from '@/types';

const keys = {
  emails: new Set(['shared@example.com']),
  phones: new Set(['+15550000001']),
};

describe('share-with-artist gate', () => {
  it('treats opt-in as shared only when not revoked or unsubscribed', () => {
    const t1 = new Date('2026-01-01');
    const t2 = new Date('2026-02-01');
    expect(isSharedWithArtist(null, null)).toBe(false);
    expect(isSharedWithArtist(t1, null)).toBe(true);
    expect(isSharedWithArtist(t1, t2)).toBe(false);
    expect(isSharedWithArtist(t2, t1)).toBe(true);
    expect(isSharedWithArtist(t1, null, t2)).toBe(false);
  });

  it('redacts email and phone for Level-1-only people, keeps shared ones', () => {
    const rows = [
      { email: 'Shared@Example.com', phone: null },
      { email: 'private@example.com', phone: '+15550000009' },
      { email: null, phone: '+15550000001' },
    ];
    const [shared, level1, sharedPhone] = applyShareGate(rows, keys);
    expect(shared).toMatchObject({
      email: 'Shared@Example.com',
      emailVisibleToArtist: true,
    });
    expect(level1).toMatchObject({
      email: null,
      phone: null,
      emailVisibleToArtist: false,
    });
    expect(sharedPhone.phone).toBe('+15550000001');
  });

  it('redacts everyone when nothing is shared', () => {
    const [row] = applyShareGate(
      [{ email: 'a@example.com', phone: '+1555' }],
      NO_SHARED_CONTACT_KEYS
    );
    expect(row.email).toBeNull();
    expect(row.phone).toBeNull();
  });

  it('CSV export never carries contact details of unshared members', () => {
    const rows = [
      {
        id: '1',
        email: 'leak@example.com',
        phone: '+15551112222',
        emailVisibleToArtist: false,
      },
      {
        id: '2',
        email: 'ok@example.com',
        phone: '+15553334444',
        emailVisibleToArtist: true,
      },
    ] as unknown as AudienceMember[];
    const out = getAudienceForExport(rows);
    expect(out[0].email).toBeNull();
    expect(out[0].phone).toBeNull();
    expect(out[1].email).toBe('ok@example.com');
    expect(JSON.stringify(out)).not.toContain('leak@example.com');
  });

  it('client helpers fail closed on explicit false only', () => {
    expect(canShareContactOut({ emailVisibleToArtist: false })).toBe(false);
    expect(canShareContactOut({ emailVisibleToArtist: true })).toBe(true);
    const r = redactUnsharedContact({
      email: 'x@y.z',
      phone: '1',
      emailVisibleToArtist: false,
    });
    expect(r.email).toBeNull();
  });
});
