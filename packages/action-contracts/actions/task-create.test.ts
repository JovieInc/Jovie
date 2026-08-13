import { describe, expect, it } from 'vitest';

import { taskCreateInputSchema } from './task-create';

/**
 * Contract parity with the canonical domain owner
 * (`apps/web/lib/tasks/types.ts` `CreateTaskInput`, storage
 * `apps/web/lib/db/schema/tasks.ts`). The action schema must not narrow
 * domain-valid values: nullable fields accept `null`, and `assigneeUserId`
 * is an opaque `text` app-user ID, not a UUID.
 */

const UUID = '123e4567-e89b-42d3-a456-426614174000';

describe('taskCreateInputSchema', () => {
  it('accepts a representative non-UUID app-user ID as assigneeUserId', () => {
    const parsed = taskCreateInputSchema.safeParse({
      title: 'Follow up with venue',
      assigneeUserId: 'user_2fK9dPqXwLmN0vYzAbC1',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.assigneeUserId).toBe('user_2fK9dPqXwLmN0vYzAbC1');
  });

  it('preserves assigneeUserId as an opaque value (no trim, no length ceiling)', () => {
    const padded = '  user_with_whitespace  ';
    const parsed = taskCreateInputSchema.safeParse({
      title: 't',
      assigneeUserId: padded,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.assigneeUserId).toBe(padded);

    const long = `u${'x'.repeat(1024)}`;
    const longParsed = taskCreateInputSchema.safeParse({
      title: 't',
      assigneeUserId: long,
    });
    expect(longParsed.success).toBe(true);
    expect(longParsed.data?.assigneeUserId).toBe(long);
  });

  it('accepts null for every nullable domain field', () => {
    const parsed = taskCreateInputSchema.safeParse({
      title: 'Follow up with venue',
      description: null,
      assigneeUserId: null,
      releaseId: null,
      parentTaskId: null,
      dueAt: null,
      scheduledFor: null,
      startedAt: null,
      completedAt: null,
      category: null,
      metadata: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('still enforces UUID shape on releaseId and parentTaskId', () => {
    for (const field of ['releaseId', 'parentTaskId'] as const) {
      expect(
        taskCreateInputSchema.safeParse({ title: 't', [field]: 'nope' }).success
      ).toBe(false);
      expect(
        taskCreateInputSchema.safeParse({ title: 't', [field]: UUID }).success
      ).toBe(true);
    }
  });

  it('still enforces content constraints on nullable string fields', () => {
    expect(
      taskCreateInputSchema.safeParse({
        title: 't',
        description: 'x'.repeat(2001),
      }).success
    ).toBe(false);
    expect(
      taskCreateInputSchema.safeParse({ title: 't', category: '' }).success
    ).toBe(false);
    expect(
      taskCreateInputSchema.safeParse({
        title: 't',
        category: 'x'.repeat(101),
      }).success
    ).toBe(false);
  });

  it('still enforces ISO datetimes on the canonical date fields', () => {
    for (const field of [
      'dueAt',
      'scheduledFor',
      'startedAt',
      'completedAt',
    ] as const) {
      expect(
        taskCreateInputSchema.safeParse({ title: 't', [field]: '2026-08-13' })
          .success
      ).toBe(false);
      expect(
        taskCreateInputSchema.safeParse({
          title: 't',
          [field]: '2026-08-13T12:00:00.000Z',
        }).success
      ).toBe(true);
    }
  });

  it('has no dueDate field; the invented name never reaches the domain', () => {
    const parsed = taskCreateInputSchema.safeParse({
      title: 't',
      dueDate: '2026-08-13',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty('dueDate');
  });
});
