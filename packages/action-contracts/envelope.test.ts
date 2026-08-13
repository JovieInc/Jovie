import { describe, expect, it } from 'vitest';
import { taskCreateAction } from './actions/task-create';
import {
  actionResultSchema,
  COMMON_ERROR_CODES,
  isErrorCodeFormat,
} from './envelope';

const META = {
  actionId: 'task.create',
  actionVersion: '1',
  idempotencyKey: 'test-key-0001',
  replayed: false,
};

describe('canonical result envelope', () => {
  const resultSchema = actionResultSchema(
    taskCreateAction.output,
    taskCreateAction.error
  );

  it('accepts a success result', () => {
    const parsed = resultSchema.safeParse({
      ok: true,
      data: {
        taskId: '123e4567-e89b-42d3-a456-426614174000',
        taskNumber: 7,
        created: true,
      },
      meta: META,
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a failure result with a structured error', () => {
    const parsed = resultSchema.safeParse({
      ok: false,
      error: {
        code: 'TASKS_WORKSPACE_LOCKED',
        message: 'Upgrade required',
        retryable: false,
      },
      meta: META,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects results without meta or with mismatched ok/discriminant', () => {
    expect(
      resultSchema.safeParse({
        ok: true,
        data: { taskId: 'x', taskNumber: 1, created: true },
      }).success
    ).toBe(false);
    expect(
      resultSchema.safeParse({ ok: true, error: {}, meta: META }).success
    ).toBe(false);
  });

  it('common error codes are SNAKE_CASE and unique', () => {
    expect(new Set(COMMON_ERROR_CODES).size).toBe(COMMON_ERROR_CODES.length);
    for (const code of COMMON_ERROR_CODES) {
      expect(isErrorCodeFormat(code)).toBe(true);
    }
  });
});
