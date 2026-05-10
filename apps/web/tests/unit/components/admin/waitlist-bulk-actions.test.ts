import { describe, expect, it, vi } from 'vitest';

import type { WaitlistEntryRow } from '@/lib/admin/waitlist';

function createEntry(
  overrides: Partial<WaitlistEntryRow> = {}
): WaitlistEntryRow {
  return {
    id: 'entry-1',
    fullName: 'Test User',
    email: 'test@example.com',
    primaryGoal: 'promote',
    primarySocialUrl: 'https://instagram.com/test',
    primarySocialPlatform: 'instagram',
    primarySocialUrlNormalized: 'https://instagram.com/test',
    spotifyUrl: null,
    spotifyUrlNormalized: null,
    spotifyArtistName: null,
    heardAbout: 'friend',
    status: 'new',
    primarySocialFollowerCount: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('Waitlist bulk approve/disapprove filtering', () => {
  it('bulk approve filters to pending statuses', () => {
    const entries = [
      createEntry({ id: '1', status: 'new' }),
      createEntry({ id: '2', status: 'invited' }),
      createEntry({ id: '3', status: 'qualified' }),
      createEntry({ id: '4', status: 'claimed' }),
      createEntry({ id: '5', status: 'waitlisted' }),
    ];
    const selectedIds = new Set(['1', '2', '3', '4', '5']);
    const selectedEntries = entries.filter(e => selectedIds.has(e.id));

    const eligible = selectedEntries.filter(
      e =>
        e.status === 'new' ||
        e.status === 'waitlisted' ||
        e.status === 'qualified'
    );

    expect(eligible).toHaveLength(3);
    expect(eligible.map(e => e.id)).toEqual(['1', '3', '5']);
  });

  it('bulk disapprove filters to approved statuses', () => {
    const entries = [
      createEntry({ id: '1', status: 'new' }),
      createEntry({ id: '2', status: 'invited' }),
      createEntry({ id: '3', status: 'approved' }),
      createEntry({ id: '4', status: 'claimed' }),
      createEntry({ id: '5', status: 'signed_up' }),
    ];
    const selectedIds = new Set(['1', '2', '3', '4', '5']);
    const selectedEntries = entries.filter(e => selectedIds.has(e.id));

    const eligible = selectedEntries.filter(
      e => e.status === 'invited' || e.status === 'approved'
    );

    expect(eligible).toHaveLength(2);
    expect(eligible.map(e => e.id)).toEqual(['2', '3']);
  });

  it('bulk approve returns empty when no entries have an approvable status', () => {
    const entries = [
      createEntry({ id: '1', status: 'invited' }),
      createEntry({ id: '2', status: 'claimed' }),
    ];
    const selectedIds = new Set(['1', '2']);
    const selectedEntries = entries.filter(e => selectedIds.has(e.id));

    const eligible = selectedEntries.filter(
      e =>
        e.status === 'new' ||
        e.status === 'qualified' ||
        e.status === 'waitlisted'
    );

    expect(eligible).toHaveLength(0);
  });

  it('bulk disapprove returns empty when all entries are "new"', () => {
    const entries = [
      createEntry({ id: '1', status: 'new' }),
      createEntry({ id: '2', status: 'new' }),
    ];
    const selectedIds = new Set(['1', '2']);
    const selectedEntries = entries.filter(e => selectedIds.has(e.id));

    const eligible = selectedEntries.filter(
      e => e.status === 'invited' || e.status === 'approved'
    );

    expect(eligible).toHaveLength(0);
  });

  it('calls approveEntry for each eligible entry', async () => {
    const entries = [
      createEntry({ id: '1', status: 'new' }),
      createEntry({ id: '2', status: 'invited' }),
      createEntry({ id: '3', status: 'new' }),
    ];
    const selectedIds = new Set(['1', '2', '3']);
    const selectedEntries = entries.filter(e => selectedIds.has(e.id));

    const approveEntry = vi.fn().mockResolvedValue(undefined);

    const eligible = selectedEntries.filter(e => e.status === 'new');
    await Promise.all(
      eligible.map(e => approveEntry({ id: e.id, status: e.status }))
    );

    expect(approveEntry).toHaveBeenCalledTimes(2);
    expect(approveEntry).toHaveBeenCalledWith({ id: '1', status: 'new' });
    expect(approveEntry).toHaveBeenCalledWith({ id: '3', status: 'new' });
  });

  it('calls disapprove mutation for each eligible approved entry', async () => {
    const entries = [
      createEntry({ id: '1', status: 'new' }),
      createEntry({ id: '2', status: 'invited' }),
      createEntry({ id: '3', status: 'approved' }),
      createEntry({ id: '4', status: 'claimed' }),
    ];
    const selectedIds = new Set(['1', '2', '3', '4']);
    const selectedEntries = entries.filter(e => selectedIds.has(e.id));

    const disapprove = vi.fn().mockResolvedValue(undefined);

    const eligible = selectedEntries.filter(
      e => e.status === 'invited' || e.status === 'approved'
    );
    await Promise.all(eligible.map(e => disapprove({ entryId: e.id })));

    expect(disapprove).toHaveBeenCalledTimes(2);
    expect(disapprove).toHaveBeenCalledWith({ entryId: '2' });
    expect(disapprove).toHaveBeenCalledWith({ entryId: '3' });
  });
});
