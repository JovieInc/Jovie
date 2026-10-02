import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {}, doesTableExist: vi.fn() }));
vi.mock('@/lib/admin/contacts', () => ({ getCanonicalContacts: vi.fn() }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import {
  deriveCustomerBlocker,
  selectRecoveryMatch,
} from '@/lib/admin/customer-recovery';

describe('deriveCustomerBlocker', () => {
  it('offers rerun-ingestion when ingestion failed and a Spotify source exists', () => {
    const blocker = deriveCustomerBlocker({
      ingestionStatus: 'failed',
      lastIngestionError: 'spotify rate limited',
      hasSpotifySource: true,
    });
    expect(blocker.kind).toBe('ingestion-failed');
    expect(blocker.operation).toBe('rerun-ingestion');
    expect(blocker.preconditionNote).toBeNull();
    expect(blocker.summary).toBe('spotify rate limited');
  });

  it('is read-only when ingestion failed without a Spotify source', () => {
    const blocker = deriveCustomerBlocker({
      ingestionStatus: 'failed',
      lastIngestionError: null,
      hasSpotifySource: false,
    });
    expect(blocker.kind).toBe('ingestion-missing-source');
    expect(blocker.operation).toBeNull();
    expect(blocker.preconditionNote).toContain('Spotify');
  });

  it.each(['pending', 'processing'])(
    'blocks duplicate retry while ingestion is %s',
    status => {
      const blocker = deriveCustomerBlocker({
        ingestionStatus: status,
        lastIngestionError: null,
        hasSpotifySource: true,
      });
      expect(blocker.kind).toBe('ingestion-in-flight');
      expect(blocker.operation).toBeNull();
    }
  );

  it('reports no blocker for a healthy idle profile', () => {
    expect(
      deriveCustomerBlocker({
        ingestionStatus: 'idle',
        lastIngestionError: null,
        hasSpotifySource: true,
      }).kind
    ).toBe('none');
  });
});

describe('selectRecoveryMatch', () => {
  const contacts = [
    {
      dedupeKey: 'email:ada@x.com',
      email: 'ada@x.com',
      handle: null,
      userId: 'u1',
      creatorProfileId: 'p1',
      leadId: null,
      waitlistEntryId: null,
    },
    {
      dedupeKey: 'handle:ada',
      email: null,
      handle: 'ada',
      userId: null,
      creatorProfileId: 'p2',
      leadId: 'l1',
      waitlistEntryId: 'w1',
    },
  ];

  it('returns null with no matches', () => {
    expect(selectRecoveryMatch([], 'ada')).toBeNull();
  });

  it('prefers the explicit key param when present', () => {
    expect(selectRecoveryMatch(contacts, 'ada', 'handle:ada')).toBe(
      'handle:ada'
    );
  });

  it('ignores an unknown key and falls back to exact identifier match', () => {
    expect(selectRecoveryMatch(contacts, 'u1', 'bogus')).toBe(
      'email:ada@x.com'
    );
  });

  it('exact-matches on supported identifiers (email, handle, linked ids)', () => {
    expect(selectRecoveryMatch(contacts, 'ADA@X.COM')).toBe('email:ada@x.com');
    expect(selectRecoveryMatch(contacts, 'w1')).toBe('handle:ada');
  });

  it('falls back to the first match for fuzzy text searches', () => {
    expect(selectRecoveryMatch(contacts, 'ad')).toBe('email:ada@x.com');
  });
});
