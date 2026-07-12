import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbInsert = vi.hoisted(() => vi.fn());
const mockOnConflictDoUpdate = vi.hoisted(() => vi.fn());
const mockValues = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockDbInsert,
    execute: vi.fn(),
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { recordSkillRunEvent } from './telemetry';

describe('recordSkillRunEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
    mockDbInsert.mockReturnValue({ values: mockValues });
  });

  it('upserts a single row keyed by invocation_id', async () => {
    await recordSkillRunEvent({
      invocationId: 'inv-1',
      skillId: 'retouch',
      skillVersion: '1.0.0',
      status: 'completed',
      costUsd: 0.0123,
      tokenCost: 400,
      model: 'google/gemini-2.5-flash-image',
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        invocationId: 'inv-1',
        skillId: 'retouch',
        skillVersion: '1.0.0',
        status: 'completed',
        costUsd: '0.012300',
        tokenCost: 400,
      })
    );
    expect(mockOnConflictDoUpdate).toHaveBeenCalled();
  });

  it('is fail-open: DB failures never throw', async () => {
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi
          .fn()
          .mockRejectedValue(
            new Error('relation "skill_run_events" does not exist')
          ),
      }),
    });

    await expect(
      recordSkillRunEvent({
        invocationId: 'inv-2',
        skillId: 'retouch',
        status: 'error',
        error: 'boom',
      })
    ).resolves.toBeUndefined();
  });

  it('is fail-open when insert itself throws (migration drift)', async () => {
    mockDbInsert.mockImplementation(() => {
      throw {
        code: '42P01',
        message: 'relation "skill_run_events" does not exist',
      };
    });

    await expect(
      recordSkillRunEvent({
        invocationId: 'inv-3',
        skillId: 'retouch',
        status: 'started',
      })
    ).resolves.toBeUndefined();
  });
});
