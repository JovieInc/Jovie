import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the db so we can capture insert args without hitting Postgres.
const { mockDbInsert, mockValues, mockReturning, mockOnConflictDoUpdate } =
  vi.hoisted(() => ({
    mockDbInsert: vi.fn(),
    mockValues: vi.fn(),
    mockReturning: vi.fn(),
    mockOnConflictDoUpdate: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({
  db: { insert: mockDbInsert },
}));

vi.mock('@/lib/db/schema/tour', () => ({
  tourDates: {
    id: 'id',
    profileId: 'profile_id',
    externalId: 'external_id',
    provider: 'provider',
  },
}));

import {
  bulkInsertSyncedEvents,
  deriveConfirmationStatus,
  insertEvent,
} from '@/lib/events/insert';

beforeEach(() => {
  vi.clearAllMocks();
  mockReturning.mockResolvedValue([{ id: 'td_1' }]);
  mockOnConflictDoUpdate.mockReturnValue({ returning: mockReturning });
  mockValues.mockReturnValue({
    returning: mockReturning,
    onConflictDoUpdate: mockOnConflictDoUpdate,
  });
  mockDbInsert.mockReturnValue({ values: mockValues });
});

describe('deriveConfirmationStatus', () => {
  it('returns confirmed for manual creator entries', () => {
    expect(deriveConfirmationStatus('manual')).toBe('confirmed');
  });

  it('returns pending for every synced provider', () => {
    expect(deriveConfirmationStatus('bandsintown')).toBe('pending');
    expect(deriveConfirmationStatus('songkick')).toBe('pending');
    expect(deriveConfirmationStatus('admin_import')).toBe('pending');
  });
});

describe('insertEvent', () => {
  const baseInput = {
    profileId: 'prof_1',
    venueName: 'The Echo',
    city: 'Los Angeles',
    country: 'US',
    startDate: new Date('2026-05-20T20:00:00Z'),
  };

  it('stamps manual rows as confirmed with reviewedAt set', async () => {
    await insertEvent({ ...baseInput, provider: 'manual' });
    const call = mockValues.mock.calls[0]?.[0];
    expect(call.provider).toBe('manual');
    expect(call.confirmationStatus).toBe('confirmed');
    expect(call.reviewedAt).toBeInstanceOf(Date);
    expect(call.eventType).toBe('tour');
  });

  it('stamps synced rows as pending with reviewedAt null', async () => {
    await insertEvent({ ...baseInput, provider: 'bandsintown' });
    const call = mockValues.mock.calls[0]?.[0];
    expect(call.provider).toBe('bandsintown');
    expect(call.confirmationStatus).toBe('pending');
    expect(call.reviewedAt).toBeNull();
  });

  it('honors explicit eventType override', async () => {
    await insertEvent({
      ...baseInput,
      provider: 'manual',
      eventType: 'livestream',
    });
    const call = mockValues.mock.calls[0]?.[0];
    expect(call.eventType).toBe('livestream');
  });

  it('treats admin_import as a synced provider (pending by default)', async () => {
    await insertEvent({ ...baseInput, provider: 'admin_import' });
    const call = mockValues.mock.calls[0]?.[0];
    expect(call.provider).toBe('admin_import');
    expect(call.confirmationStatus).toBe('pending');
  });
});

describe('bulkInsertSyncedEvents', () => {
  const baseInput = {
    profileId: 'prof_1',
    venueName: 'The Echo',
    city: 'Los Angeles',
    country: 'US',
    startDate: new Date('2026-05-20T20:00:00Z'),
  };

  it('returns 0 immediately on empty input without touching the db', async () => {
    const result = await bulkInsertSyncedEvents([]);
    expect(result).toBe(0);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it('flips every synced row to pending', async () => {
    mockReturning.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    await bulkInsertSyncedEvents([
      { ...baseInput, provider: 'admin_import' },
      { ...baseInput, provider: 'bandsintown', externalId: 'x' },
    ]);
    const rows = mockValues.mock.calls[0]?.[0];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.confirmationStatus).toBe('pending');
      expect(row.reviewedAt).toBeNull();
      expect(row.eventType).toBe('tour');
    }
  });

  it('returns the count of inserted rows', async () => {
    mockReturning.mockResolvedValueOnce([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]);
    const result = await bulkInsertSyncedEvents([
      { ...baseInput, provider: 'bandsintown' },
      { ...baseInput, provider: 'bandsintown' },
      { ...baseInput, provider: 'bandsintown' },
    ]);
    expect(result).toBe(3);
  });

  it('upserts duplicate synced rows without overwriting review state fields', async () => {
    await bulkInsertSyncedEvents([
      { ...baseInput, provider: 'admin_import', externalId: 'evt_1' },
    ]);

    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: ['profile_id', 'external_id', 'provider'],
      })
    );

    const upsertConfig = mockOnConflictDoUpdate.mock.calls[0]?.[0];
    expect(upsertConfig?.set).toEqual(
      expect.objectContaining({
        updatedAt: expect.any(Date),
      })
    );
    expect(upsertConfig?.set).not.toHaveProperty('confirmationStatus');
    expect(upsertConfig?.set).not.toHaveProperty('reviewedAt');
    expect(upsertConfig?.set).not.toHaveProperty('eventType');
  });
});
