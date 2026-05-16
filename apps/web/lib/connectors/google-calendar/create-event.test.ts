/**
 * Unit tests for calendar.createEvent.
 *
 * Uses in-memory mocks for the DB and calendarClient.
 * Does NOT require a real database connection.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarApiClient } from './create-event';
import {
  ApprovalRequiredError,
  createCalendarEvent,
  uuidToGoogleEventId,
} from './create-event';

// ---------------------------------------------------------------------------
// Mock @/lib/db
// ---------------------------------------------------------------------------

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockDbSelect,
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: mockDbUpdate,
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_A = 'user-a-uuid-1234-0000-000000000000';
const USER_B = 'user-b-uuid-5678-0000-000000000000';
const ACTION_ID = '550e8400-e29b-41d4-a716-446655440000';
const IDEMPOTENCY_KEY = ACTION_ID;

const basePayload = {
  title: 'Show at Output Brooklyn',
  startsAt: '2026-05-23T22:00:00+00:00',
  endsAt: '2026-05-24T04:00:00+00:00',
  timeZone: 'America/New_York',
};

function makeAcceptedRow() {
  return [
    {
      id: ACTION_ID,
      status: 'accepted' as const,
      userId: USER_A,
      idempotencyKey: IDEMPOTENCY_KEY,
    },
  ];
}

function makeSuccessfulCalendarClient(): CalendarApiClient {
  return {
    createEvent: vi
      .fn()
      .mockResolvedValue({ id: uuidToGoogleEventId(ACTION_ID) }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('uuidToGoogleEventId', () => {
  it('strips hyphens and lowercases', () => {
    const result = uuidToGoogleEventId('550E8400-E29B-41D4-A716-446655440000');
    expect(result).toBe('550e8400e29b41d4a716446655440000');
    expect(result).toMatch(/^[0-9a-v]+$/);
  });

  it('produces valid Google event ID characters (base32hex subset)', () => {
    const id = uuidToGoogleEventId(ACTION_ID);
    // UUID hex chars are 0-9 and a-f, both valid in base32hex (0-9, a-v)
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id.length).toBeGreaterThanOrEqual(5);
    expect(id.length).toBeLessThanOrEqual(1024);
  });
});

describe('createCalendarEvent — approval gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws ApprovalRequiredError with reason=not_found when row does not exist', async () => {
    // Both assertions invoke the function once each, so we need two mock values.
    mockDbSelect.mockResolvedValueOnce([]); // first call
    mockDbSelect.mockResolvedValueOnce([]); // second call

    await expect(
      createCalendarEvent({
        approvalId: ACTION_ID,
        userId: USER_A,
        payload: basePayload,
        calendarClient: makeSuccessfulCalendarClient(),
      })
    ).rejects.toThrow(ApprovalRequiredError);

    await expect(
      createCalendarEvent({
        approvalId: ACTION_ID,
        userId: USER_A,
        payload: basePayload,
        calendarClient: makeSuccessfulCalendarClient(),
      })
    ).rejects.toMatchObject({ reason: 'not_found' });
  });

  it('throws ApprovalRequiredError with reason=wrong_user for another user row', async () => {
    mockDbSelect.mockResolvedValue([
      {
        id: ACTION_ID,
        status: 'accepted' as const,
        userId: USER_B, // belongs to B
        idempotencyKey: IDEMPOTENCY_KEY,
      },
    ]);

    await expect(
      createCalendarEvent({
        approvalId: ACTION_ID,
        userId: USER_A, // but called by A
        payload: basePayload,
        calendarClient: makeSuccessfulCalendarClient(),
      })
    ).rejects.toMatchObject({
      reason: 'wrong_user',
      name: 'ApprovalRequiredError',
    });
  });

  it('throws ApprovalRequiredError with reason=not_accepted for pending row', async () => {
    mockDbSelect.mockResolvedValue([
      {
        id: ACTION_ID,
        status: 'pending' as const,
        userId: USER_A,
        idempotencyKey: IDEMPOTENCY_KEY,
      },
    ]);

    await expect(
      createCalendarEvent({
        approvalId: ACTION_ID,
        userId: USER_A,
        payload: basePayload,
        calendarClient: makeSuccessfulCalendarClient(),
      })
    ).rejects.toMatchObject({ reason: 'not_accepted' });
  });

  it('throws ApprovalRequiredError with reason=not_accepted for dismissed row', async () => {
    mockDbSelect.mockResolvedValue([
      {
        id: ACTION_ID,
        status: 'dismissed' as const,
        userId: USER_A,
        idempotencyKey: IDEMPOTENCY_KEY,
      },
    ]);

    await expect(
      createCalendarEvent({
        approvalId: ACTION_ID,
        userId: USER_A,
        payload: basePayload,
        calendarClient: makeSuccessfulCalendarClient(),
      })
    ).rejects.toMatchObject({ reason: 'not_accepted' });
  });
});

describe('createCalendarEvent — happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockResolvedValue(makeAcceptedRow());
    mockDbUpdate.mockResolvedValue([{ id: ACTION_ID }]);
  });

  it('calls calendarClient.createEvent with deterministic eventId', async () => {
    const client = makeSuccessfulCalendarClient();
    const result = await createCalendarEvent({
      approvalId: ACTION_ID,
      userId: USER_A,
      payload: basePayload,
      calendarClient: client,
    });

    const expectedEventId = uuidToGoogleEventId(IDEMPOTENCY_KEY);
    expect(client.createEvent).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: expectedEventId,
      event: expect.objectContaining({
        summary: 'Show at Output Brooklyn',
        start: { dateTime: basePayload.startsAt, timeZone: 'America/New_York' },
        end: { dateTime: basePayload.endsAt, timeZone: 'America/New_York' },
      }),
    });
    expect(result.googleEventId).toBe(expectedEventId);
    expect(result.idempotent).toBe(false);
  });

  it('CAS-transitions accepted → completed on success', async () => {
    await createCalendarEvent({
      approvalId: ACTION_ID,
      userId: USER_A,
      payload: basePayload,
      calendarClient: makeSuccessfulCalendarClient(),
    });

    expect(mockDbUpdate).toHaveBeenCalledOnce();
  });

  it('defaults end time to 1 hour after start when endsAt is omitted', async () => {
    const client = makeSuccessfulCalendarClient();
    await createCalendarEvent({
      approvalId: ACTION_ID,
      userId: USER_A,
      payload: {
        title: 'Gig',
        startsAt: '2026-06-01T20:00:00+00:00',
        timeZone: 'UTC',
      },
      calendarClient: client,
    });

    expect(client.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          end: { dateTime: '2026-06-01T21:00:00.000Z', timeZone: 'UTC' },
        }),
      })
    );
  });
});

describe('createCalendarEvent — Google 409 idempotent handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockResolvedValue(makeAcceptedRow());
    mockDbUpdate.mockResolvedValue([{ id: ACTION_ID }]);
  });

  it('treats Google 409 conflict as success with idempotent=true', async () => {
    const conflictError = {
      status: 409,
      message: 'The requested identifier already exists.',
    };
    const client: CalendarApiClient = {
      createEvent: vi.fn().mockRejectedValue(conflictError),
    };

    const result = await createCalendarEvent({
      approvalId: ACTION_ID,
      userId: USER_A,
      payload: basePayload,
      calendarClient: client,
    });

    expect(result.idempotent).toBe(true);
    expect(result.googleEventId).toBe(uuidToGoogleEventId(IDEMPOTENCY_KEY));
    // CAS should still run
    expect(mockDbUpdate).toHaveBeenCalledOnce();
  });

  it('throws CalendarWriteError on non-409 API errors', async () => {
    const serverError = { status: 503, message: 'Service Unavailable' };
    const client: CalendarApiClient = {
      createEvent: vi.fn().mockRejectedValue(serverError),
    };

    await expect(
      createCalendarEvent({
        approvalId: ACTION_ID,
        userId: USER_A,
        payload: basePayload,
        calendarClient: client,
      })
    ).rejects.toMatchObject({ name: 'CalendarWriteError' });
  });
});

describe('createCalendarEvent — no client injected', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockResolvedValue(makeAcceptedRow());
  });

  it('throws when no calendarClient is provided', async () => {
    await expect(
      createCalendarEvent({
        approvalId: ACTION_ID,
        userId: USER_A,
        payload: basePayload,
        // calendarClient intentionally omitted
      })
    ).rejects.toThrow('no calendarClient injected');
  });
});
