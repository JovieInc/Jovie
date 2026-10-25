import { describe, expect, it } from 'vitest';
import { getAudienceForExport } from '@/features/dashboard/organisms/dashboard-audience-table/utils/exportAudience';
import {
  applyShareGate,
  canShareContactOut,
  isSharedWithArtist,
  NO_SHARED_CONTACT_KEYS,
  redactUnsharedContact,
  resolveShareKeys,
} from '@/lib/audience/share-gate';
import type { AudienceMember } from '@/types';

const d = (s: string) => new Date(s);
const sub = (
  email: string | null,
  optInAt: string | null,
  extra: { optOutAt?: string; unsubscribedAt?: string; phone?: string } = {}
) => ({
  email,
  phone: extra.phone ?? null,
  optInAt: optInAt ? d(optInAt) : null,
  optOutAt: extra.optOutAt ? d(extra.optOutAt) : null,
  unsubscribedAt: extra.unsubscribedAt ? d(extra.unsubscribedAt) : null,
});

describe('share-with-artist gate', () => {
  it('single-row consent: opt-in must be later than any revocation', () => {
    expect(isSharedWithArtist(null, null)).toBe(false);
    expect(isSharedWithArtist(d('2026-01-01'), null)).toBe(true);
    expect(isSharedWithArtist(d('2026-01-01'), d('2026-02-01'))).toBe(false);
    expect(isSharedWithArtist(d('2026-02-01'), d('2026-01-01'))).toBe(true);
    expect(isSharedWithArtist(d('2026-01-01'), null, d('2026-02-01'))).toBe(
      false
    );
  });

  it('resolves consent per person across duplicate rows (latest revocation wins)', () => {
    const keys = resolveShareKeys([
      // Shared on row A, unsubscribed later on duplicate row B (whitespace/case differ).
      sub('Revoked@Example.com', '2026-01-01'),
      sub(' revoked@example.com ', null, { unsubscribedAt: '2026-03-01' }),
      sub('shared@example.com', '2026-01-01'),
      // Re-shared after an earlier opt-out.
      sub('reshared@example.com', '2026-01-01', { optOutAt: '2026-02-01' }),
      sub('reshared@example.com', '2026-04-01'),
      sub('level1@example.com', null),
    ]);
    expect(keys.emails.get('revoked@example.com')).toBe('revoked');
    expect(keys.emails.get('shared@example.com')).toBe('shared');
    expect(keys.emails.get('reshared@example.com')).toBe('shared');
    expect(keys.emails.has('level1@example.com')).toBe(false);
  });

  it('shows contact only for shared people, hides revoked and Level-1', () => {
    const keys = resolveShareKeys([
      sub('shared@example.com', '2026-01-01'),
      sub('revoked@example.com', '2026-01-01', {
        unsubscribedAt: '2026-02-01',
      }),
      sub(null, '2026-01-01', { phone: '+15550000001' }),
    ]);
    const [shared, revoked, level1, phoneShared] = applyShareGate(
      [
        { email: 'Shared@Example.com', phone: null },
        { email: 'revoked@example.com', phone: null },
        { email: 'level1@example.com', phone: '+15550000009' },
        { email: null, phone: '+15550000001' },
      ],
      keys
    );
    expect(shared).toMatchObject({
      email: 'Shared@Example.com',
      emailVisibleToArtist: true,
    });
    expect(revoked).toMatchObject({
      email: null,
      phone: null,
      emailVisibleToArtist: false,
    });
    expect(level1).toMatchObject({
      email: null,
      phone: null,
      emailVisibleToArtist: false,
    });
    expect(phoneShared.phone).toBe('+15550000001');
  });

  it('a revoked identifier hides the person even if the other identifier is shared', () => {
    const keys = resolveShareKeys([
      sub('a@example.com', '2026-01-01'),
      sub(null, '2026-01-01', { phone: '+1555', unsubscribedAt: '2026-02-01' }),
    ]);
    const [row] = applyShareGate(
      [{ email: 'a@example.com', phone: '+1555' }],
      keys
    );
    expect(row.email).toBeNull();
    expect(row.phone).toBeNull();
  });

  it('redacts everyone when nothing is shared', () => {
    const [row] = applyShareGate(
      [{ email: 'a@example.com', phone: '+1555' }],
      NO_SHARED_CONTACT_KEYS
    );
    expect(row.email).toBeNull();
    expect(row.phone).toBeNull();
  });

  it('CSV export never carries contact details of unshared or unflagged members', () => {
    const rows = [
      {
        id: '1',
        email: 'leak@example.com',
        phone: '+15551112222',
        emailVisibleToArtist: false,
      },
      // Flag missing entirely: must fail closed.
      { id: '3', email: 'unflagged@example.com', phone: '+15555556666' },
      {
        id: '2',
        email: 'ok@example.com',
        phone: '+15553334444',
        emailVisibleToArtist: true,
      },
    ] as unknown as AudienceMember[];
    const out = getAudienceForExport(rows);
    const json = JSON.stringify(out);
    expect(json).not.toContain('leak@example.com');
    expect(json).not.toContain('unflagged@example.com');
    expect(out[2].email).toBe('ok@example.com');
  });

  it('client helpers fail closed: only an explicit true is shared', () => {
    expect(canShareContactOut({ emailVisibleToArtist: true })).toBe(true);
    expect(canShareContactOut({ emailVisibleToArtist: false })).toBe(false);
    expect(canShareContactOut({})).toBe(false);
    expect(
      redactUnsharedContact({ email: 'x@y.z', phone: '1' }).email
    ).toBeNull();
  });
});
