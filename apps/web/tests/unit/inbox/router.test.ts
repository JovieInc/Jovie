import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  info: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mocked.select,
    update: mocked.update,
  },
}));
vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  eq: (left: unknown, right: unknown) => [left, right],
}));
vi.mock('@/lib/db/schema/inbox', () => ({
  emailThreads: {
    id: 'thread.id',
    creatorProfileId: 'thread.creatorProfileId',
    isRead: 'thread.isRead',
    category: { enumValues: ['booking', 'management'] },
  },
}));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorContactAssignments: {
    id: 'assignment.id',
    personId: 'assignment.personId',
    responsibilityId: 'assignment.responsibilityId',
    territories: 'assignment.territories',
    isActive: 'assignment.isActive',
    isPrimary: 'assignment.isPrimary',
    sortOrder: 'assignment.sortOrder',
  },
  creatorContactPeople: {
    id: 'person.id',
    creatorProfileId: 'person.creatorProfileId',
    displayName: 'person.displayName',
  },
  creatorContactResponsibilities: {
    id: 'responsibility.id',
    role: 'responsibility.role',
  },
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: mocked.info },
}));

function threadRows(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi
        .fn()
        .mockReturnValue({ limit: vi.fn().mockResolvedValue(rows) }),
    }),
  };
}

function assignmentRows(rows: unknown[]) {
  const joined = {
    innerJoin: vi.fn(),
    where: vi.fn().mockResolvedValue(rows),
  };
  joined.innerJoin.mockReturnValue(joined);
  return { from: vi.fn().mockReturnValue(joined) };
}

describe('Jovie Inbox assignment router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.update.mockReturnValue({
      set: mocked.set.mockReturnValue({
        where: mocked.where.mockResolvedValue(undefined),
      }),
    });
  });

  it('records the visible Jovie manager fallback internally without a duplicate contact row', async () => {
    mocked.select
      .mockReturnValueOnce(
        threadRows([
          { id: 'thread-1', creatorProfileId: 'profile-1', isRead: false },
        ])
      )
      .mockReturnValueOnce(assignmentRows([]));
    const { confirmAndRoute } = await import('@/lib/inbox/router');

    await expect(
      confirmAndRoute('thread-1', 'management', null)
    ).resolves.toEqual({
      success: true,
      assignedToJovie: true,
    });

    expect(mocked.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'in_progress',
        routedToContactPersonId: null,
      })
    );
    expect(mocked.set.mock.calls[0]?.[0]).not.toHaveProperty(
      'routedToContactId'
    );
  });

  it('records the deterministically selected directory person and does not send correspondence', async () => {
    mocked.select
      .mockReturnValueOnce(
        threadRows([
          { id: 'thread-1', creatorProfileId: 'profile-1', isRead: false },
        ])
      )
      .mockReturnValueOnce(
        assignmentRows([
          {
            personId: 'worldwide-primary',
            displayName: 'World Agent',
            role: 'bookings',
            territories: ['Worldwide'],
            isPrimary: true,
            sortOrder: 0,
          },
          {
            personId: 'regional-agent',
            displayName: 'Europe Agent',
            role: 'bookings',
            territories: ['Europe'],
            isPrimary: false,
            sortOrder: 1,
          },
        ])
      );
    const { confirmAndRoute } = await import('@/lib/inbox/router');

    await expect(
      confirmAndRoute('thread-1', 'booking', 'Europe')
    ).resolves.toEqual({
      success: true,
      routedToContactPersonId: 'regional-agent',
    });

    expect(mocked.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'routed',
        routedToContactPersonId: 'regional-agent',
      })
    );
    expect(mocked.info).toHaveBeenCalledWith(
      'Inbox thread assigned internally',
      expect.objectContaining({ personId: 'regional-agent' })
    );
  });
});
