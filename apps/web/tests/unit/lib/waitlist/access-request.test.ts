import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockWithSystemIngestionSession = vi.hoisted(() => vi.fn());
const mockNotifySlackWaitlist = vi.hoisted(() => vi.fn());
const mockTryReserveAutoAcceptSlot = vi.hoisted(() => vi.fn());
const mockApproveWaitlistEntryInTx = vi.hoisted(() => vi.fn());
const mockFinalizeWaitlistApproval = vi.hoisted(() => vi.fn());

const mockUsers = vi.hoisted(() => ({
  id: 'users.id',
  clerkId: 'users.clerk_id',
  email: 'users.email',
  userStatus: 'users.user_status',
  waitlistEntryId: 'users.waitlist_entry_id',
  updatedAt: 'users.updated_at',
}));

const mockWaitlistEntries = vi.hoisted(() => ({
  id: 'waitlist_entries.id',
  email: 'waitlist_entries.email',
  fullName: 'waitlist_entries.full_name',
  status: 'waitlist_entries.status',
  primaryGoal: 'waitlist_entries.primary_goal',
  primarySocialUrl: 'waitlist_entries.primary_social_url',
  primarySocialPlatform: 'waitlist_entries.primary_social_platform',
  primarySocialUrlNormalized: 'waitlist_entries.primary_social_url_normalized',
  spotifyUrl: 'waitlist_entries.spotify_url',
  spotifyUrlNormalized: 'waitlist_entries.spotify_url_normalized',
  spotifyArtistName: 'waitlist_entries.spotify_artist_name',
  heardAbout: 'waitlist_entries.heard_about',
  selectedPlan: 'waitlist_entries.selected_plan',
  updatedAt: 'waitlist_entries.updated_at',
  createdAt: 'waitlist_entries.created_at',
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: mockUsers,
}));

vi.mock('@/lib/db/schema/waitlist', () => ({
  waitlistEntries: mockWaitlistEntries,
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

vi.mock('@/lib/notifications/providers/slack', () => ({
  notifySlackWaitlist: mockNotifySlackWaitlist,
}));

vi.mock('@/lib/waitlist/settings', () => ({
  tryReserveAutoAcceptSlot: mockTryReserveAutoAcceptSlot,
}));

vi.mock('@/lib/waitlist/approval', () => ({
  approveWaitlistEntryInTx: mockApproveWaitlistEntryInTx,
  finalizeWaitlistApproval: mockFinalizeWaitlistApproval,
}));

vi.mock('drizzle-orm', () => ({
  desc: vi.fn(value => ({ desc: value })),
  eq: vi.fn((left, right) => ({ eq: [left, right] })),
  sql: vi.fn((strings, ...values) => ({ sql: strings, values })),
}));

import { submitWaitlistAccessRequest } from '@/lib/waitlist/access-request';

function createSelectRows(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy, limit });
  const from = vi.fn().mockReturnValue({ where });
  return { builder: { from }, from, where, orderBy, limit };
}

function createInsertReturning(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const values = vi.fn().mockReturnValue({ returning });
  return { builder: { values }, values, returning };
}

function createInsertOnly() {
  const values = vi.fn().mockResolvedValue(undefined);
  return { builder: { values }, values };
}

function createUpdateOnly() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  return { builder: { set }, set, where };
}

function createTx(params: {
  readonly selectRows: unknown[][];
  readonly waitlistInsertRows?: unknown[];
  readonly userInsert?: ReturnType<typeof createInsertOnly>;
  readonly updates?: ReturnType<typeof createUpdateOnly>[];
}) {
  const selectQueue = params.selectRows.map(createSelectRows);
  const waitlistInsert = createInsertReturning(params.waitlistInsertRows ?? []);
  const userInsert = params.userInsert ?? createInsertOnly();
  const updateQueue = [...(params.updates ?? [])];

  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(
      () => selectQueue.shift()?.builder ?? createSelectRows([]).builder
    ),
    insert: vi.fn((table: unknown) =>
      table === mockWaitlistEntries
        ? waitlistInsert.builder
        : userInsert.builder
    ),
    update: vi.fn(
      () => updateQueue.shift()?.builder ?? createUpdateOnly().builder
    ),
  };

  return { tx, waitlistInsert, userInsert, updates: updateQueue };
}

const baseInput = {
  clerkUserId: 'clerk_123',
  email: 'Test@Example.com',
  emailRaw: 'Test@Example.com',
  fullName: 'Test User',
  data: {
    primaryGoal: null,
    primarySocialUrl: 'https://instagram.com/testuser',
    spotifyUrl: null,
    spotifyArtistName: null,
    heardAbout: 'onboarding_chat',
    selectedPlan: null,
  },
};

describe('submitWaitlistAccessRequest', () => {
  let activeTx: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNotifySlackWaitlist.mockResolvedValue(undefined);
    mockWithSystemIngestionSession.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(activeTx)
    );
    mockTryReserveAutoAcceptSlot.mockResolvedValue({
      shouldAutoAccept: false,
      reason: 'gate_on',
    });
    mockApproveWaitlistEntryInTx.mockResolvedValue({ outcome: 'not_found' });
  });

  it('creates a new entry, locks by normalized email, and waitlists when the gate is on', async () => {
    const txHarness = createTx({
      selectRows: [[], []],
      waitlistInsertRows: [{ id: 'entry_123' }],
    });
    activeTx = txHarness.tx;

    const result = await submitWaitlistAccessRequest(baseInput);

    expect(result).toEqual({
      entryId: 'entry_123',
      status: 'new',
      outcome: 'waitlisted_gate_on',
    });
    expect(txHarness.tx.execute).toHaveBeenCalledTimes(1);
    expect(txHarness.waitlistInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'test@example.com',
        fullName: 'Test User',
        primarySocialUrl: 'https://instagram.com/testuser',
        status: 'new',
      })
    );
    expect(mockWithSystemIngestionSession).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'serializable' }
    );
    expect(mockTryReserveAutoAcceptSlot).toHaveBeenCalledWith(txHarness.tx);
    expect(mockApproveWaitlistEntryInTx).not.toHaveBeenCalled();
  });

  it('accepts a new entry only after reserving a daily slot', async () => {
    const txHarness = createTx({
      selectRows: [[], []],
      waitlistInsertRows: [{ id: 'entry_accepted' }],
    });
    activeTx = txHarness.tx;
    mockTryReserveAutoAcceptSlot.mockResolvedValue({
      shouldAutoAccept: true,
      reason: 'reserved',
    });
    mockApproveWaitlistEntryInTx.mockResolvedValue({
      outcome: 'approved',
      entryId: 'entry_accepted',
      profileId: null,
      email: 'test@example.com',
      fullName: 'Test User',
      clerkId: 'clerk_123',
    });

    const result = await submitWaitlistAccessRequest(baseInput);

    expect(result).toEqual({
      entryId: 'entry_accepted',
      status: 'claimed',
      outcome: 'accepted',
    });
    expect(mockApproveWaitlistEntryInTx).toHaveBeenCalledWith(
      txHarness.tx,
      'entry_accepted'
    );
    expect(mockFinalizeWaitlistApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'approved',
        entryId: 'entry_accepted',
      })
    );
  });

  it('updates existing pending requests without consuming an auto-accept slot', async () => {
    const waitlistUpdate = createUpdateOnly();
    const txHarness = createTx({
      selectRows: [[{ id: 'entry_existing', status: 'new' }], []],
      updates: [waitlistUpdate],
    });
    activeTx = txHarness.tx;

    const result = await submitWaitlistAccessRequest({
      ...baseInput,
      data: {
        ...baseInput.data,
        primarySocialUrl: 'https://tiktok.com/@testuser',
      },
    });

    expect(result).toEqual({
      entryId: 'entry_existing',
      status: 'new',
      outcome: 'already_waitlisted',
    });
    expect(waitlistUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        primarySocialUrl: 'https://tiktok.com/@testuser',
        email: 'test@example.com',
      })
    );
    expect(mockTryReserveAutoAcceptSlot).not.toHaveBeenCalled();
    expect(mockNotifySlackWaitlist).not.toHaveBeenCalled();
  });
});
