import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { database, mockDel, mockHead, mockLoggerError } = vi.hoisted(() => {
  const database = {
    row: null as Record<string, unknown> | null,
    forceConflict: false,
    insertValues: vi.fn(),
    updateSet: vi.fn(),
    matches: (condition: unknown) => {
      if (!database.row) return false;
      const clauses = (
        condition as {
          readonly clauses?: readonly {
            readonly field?: string;
            readonly value?: unknown;
          }[];
        }
      ).clauses;
      return Boolean(
        clauses?.every(clause => {
          const key =
            clause.field === 'user_id'
              ? 'userId'
              : clause.field === 'id' || clause.field === 'status'
                ? clause.field
                : null;
          return key !== null && database.row?.[key] === clause.value;
        })
      );
    },
  };
  return {
    database,
    mockDel: vi.fn(),
    mockHead: vi.fn(),
    mockLoggerError: vi.fn(),
  };
});

vi.mock('@vercel/blob', () => ({ del: mockDel, head: mockHead }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: mockLoggerError, info: vi.fn(), warn: vi.fn() },
}));
vi.mock('drizzle-orm', () => ({
  and: (...clauses: unknown[]) => ({ clauses }),
  eq: (column: unknown, value: unknown) => ({
    field:
      column && typeof column === 'object' && 'name' in column
        ? column.name
        : null,
    value,
  }),
}));
vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: (values: Record<string, unknown>) => {
        database.insertValues(values);
        database.row ??= { ...values, executionResult: null };
        return { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) };
      },
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((condition: unknown) => ({
          limit: vi.fn(async () =>
            database.matches(condition) && database.row ? [database.row] : []
          ),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: (values: Record<string, unknown>) => {
        database.updateSet(values);
        return {
          where: vi.fn((condition: unknown) => ({
            returning: vi.fn(async () => {
              if (database.forceConflict || !database.matches(condition)) {
                return [];
              }
              database.row = { ...database.row, ...values };
              return [{ id: database.row.id }];
            }),
          })),
        };
      },
    })),
  },
}));

import {
  createWorkflowCaptureRequest,
  deriveWorkflowCaptureId,
  mutateWorkflowCapture,
  WorkflowCaptureError,
} from './server';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const PRIVATE_BLOB_URL =
  'https://private.blob.vercel-storage.com/workflow.webm';

async function createRequest() {
  return createWorkflowCaptureRequest({
    userId: USER_ID,
    request: {
      requestingTaskId: 'youtube-thumbnail-operator',
      requestKey: 'studio-native-experiment-round-1',
      title: 'Record YouTube Studio',
      instructions: 'Show one native thumbnail experiment from start to save.',
      startUrl: 'https://studio.youtube.com',
    },
  });
}

describe('workflow capture server state machine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T17:00:00.000Z'));
    database.row = null;
    database.forceConflict = false;
    database.insertValues.mockClear();
    database.updateSet.mockClear();
    mockDel.mockReset();
    mockHead.mockReset();
    mockLoggerError.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('creates one deterministic pending Inbox request', async () => {
    const first = await createRequest();
    const second = await createRequest();

    expect(first).toEqual(second);
    expect(
      deriveWorkflowCaptureId({
        userId: USER_ID,
        requestingTaskId: 'youtube-thumbnail-operator',
        requestKey: 'different-round',
      })
    ).not.toBe(first.captureId);
    expect(first).toMatchObject({
      requestingTaskId: 'youtube-thumbnail-operator',
      state: 'pending',
      sha256: null,
    });
    expect(database.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: first.captureId,
        kind: 'workflow_capture.request',
        userId: USER_ID,
        status: 'pending',
      })
    );
    await expect(
      mutateWorkflowCapture({
        captureId: first.captureId,
        userId: '00000000-0000-4000-8000-000000000099',
        mutation: { action: 'revoke' },
      })
    ).rejects.toMatchObject({ code: 'not-found', status: 404 });
    expect(database.row?.status).toBe('pending');
  });

  it('verifies the private blob before attaching an upload receipt', async () => {
    const request = await createRequest();
    const pathname = `workflow-captures/${USER_ID}/${request.captureId}/workflow.webm`;
    mockHead.mockResolvedValue({
      url: PRIVATE_BLOB_URL,
      pathname,
      contentType: 'video/webm',
      size: 4_096,
    });

    const mutation = {
      action: 'confirm-upload' as const,
      blobUrl: PRIVATE_BLOB_URL,
      pathname,
      sha256: 'b'.repeat(64),
      byteSize: 4_096,
      durationMs: 30_000,
    };
    const receipt = await mutateWorkflowCapture({
      captureId: request.captureId,
      userId: USER_ID,
      mutation,
    });

    expect(mockHead).toHaveBeenCalledWith(PRIVATE_BLOB_URL);
    expect(receipt).toMatchObject({
      state: 'uploaded_needs_review',
      sha256: 'b'.repeat(64),
      byteSize: 4_096,
      durationMs: 30_000,
    });
    expect(receipt).not.toHaveProperty('blobUrl');
    await expect(
      mutateWorkflowCapture({
        captureId: request.captureId,
        userId: USER_ID,
        mutation,
      })
    ).rejects.toMatchObject({ code: 'capture-already-uploaded', status: 409 });
    expect(mockHead).toHaveBeenCalledTimes(1);
  });

  it('requires review before ready and supports permanent revocation', async () => {
    const request = await createRequest();
    await expect(
      mutateWorkflowCapture({
        captureId: request.captureId,
        userId: USER_ID,
        mutation: { action: 'mark-ready' },
      })
    ).rejects.toMatchObject({ code: 'capture-review-required', status: 409 });

    const pathname = `workflow-captures/${USER_ID}/${request.captureId}/workflow.webm`;
    mockHead.mockResolvedValue({
      url: PRIVATE_BLOB_URL,
      pathname,
      contentType: 'video/webm',
      size: 4_096,
    });
    await mutateWorkflowCapture({
      captureId: request.captureId,
      userId: USER_ID,
      mutation: {
        action: 'confirm-upload',
        blobUrl: PRIVATE_BLOB_URL,
        pathname,
        sha256: 'c'.repeat(64),
        byteSize: 4_096,
        durationMs: 30_000,
      },
    });
    const ready = await mutateWorkflowCapture({
      captureId: request.captureId,
      userId: USER_ID,
      mutation: { action: 'mark-ready' },
    });
    expect(ready.state).toBe('ready');

    mockDel.mockRejectedValueOnce(new Error('blob already missing'));
    const revoked = await mutateWorkflowCapture({
      captureId: request.captureId,
      userId: USER_ID,
      mutation: { action: 'revoke' },
    });
    expect(mockDel).toHaveBeenCalledWith(PRIVATE_BLOB_URL);
    expect(revoked).toMatchObject({ state: 'revoked', sha256: 'c'.repeat(64) });
    expect(database.row?.status).toBe('expired');
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[workflow-capture] revoked blob deletion failed',
      expect.objectContaining({ captureId: request.captureId })
    );
  });

  it('rejects a blob outside the owner-scoped capture path without reading it', async () => {
    const request = await createRequest();
    await expect(
      mutateWorkflowCapture({
        captureId: request.captureId,
        userId: USER_ID,
        mutation: {
          action: 'confirm-upload',
          blobUrl: PRIVATE_BLOB_URL,
          pathname: 'workflow-captures/another-user/capture.webm',
          sha256: 'd'.repeat(64),
          byteSize: 4_096,
          durationMs: 30_000,
        },
      })
    ).rejects.toBeInstanceOf(WorkflowCaptureError);
    expect(mockHead).not.toHaveBeenCalled();
    expect(database.updateSet).not.toHaveBeenCalled();
  });

  it.each([
    ['image/png', 4_096],
    ['video/webm', 2_048],
  ])('rejects unverified blob metadata (%s, %i)', async (contentType, size) => {
    const request = await createRequest();
    const pathname = `workflow-captures/${USER_ID}/${request.captureId}/workflow.webm`;
    mockHead.mockResolvedValue({
      url: PRIVATE_BLOB_URL,
      pathname,
      contentType,
      size,
    });
    await expect(
      mutateWorkflowCapture({
        captureId: request.captureId,
        userId: USER_ID,
        mutation: {
          action: 'confirm-upload',
          blobUrl: PRIVATE_BLOB_URL,
          pathname,
          sha256: 'e'.repeat(64),
          byteSize: 4_096,
          durationMs: 30_000,
        },
      })
    ).rejects.toMatchObject({
      code: 'capture-verification-failed',
      status: 422,
    });
    expect(database.updateSet).not.toHaveBeenCalled();
  });

  it('expires before Blob lookup', async () => {
    const request = await createRequest();
    vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1_000);
    await expect(
      mutateWorkflowCapture({
        captureId: request.captureId,
        userId: USER_ID,
        mutation: {
          action: 'confirm-upload',
          blobUrl: PRIVATE_BLOB_URL,
          pathname: `workflow-captures/${USER_ID}/${request.captureId}/workflow.webm`,
          sha256: 'f'.repeat(64),
          byteSize: 4_096,
          durationMs: 30_000,
        },
      })
    ).rejects.toMatchObject({ code: 'capture-request-expired', status: 410 });
    expect(mockHead).not.toHaveBeenCalled();
  });
});
