import { describe, expect, it } from 'vitest';
import { buildTaskUpdateFieldPatch } from './task-update';
import type { TaskView } from './types';

function createExistingTask(
  overrides: Partial<Pick<TaskView, 'completedAt' | 'status'>> = {}
): Pick<TaskView, 'completedAt' | 'status'> {
  return {
    status: overrides.status ?? 'todo',
    completedAt: overrides.completedAt ?? null,
  };
}

describe('buildTaskUpdateFieldPatch', () => {
  const now = new Date('2026-05-15T12:00:00.000Z');

  it('only writes submitted scalar fields so stale saves cannot clobber metadata', () => {
    expect(
      buildTaskUpdateFieldPatch(
        { priority: 'urgent' },
        createExistingTask({
          status: 'backlog',
          completedAt: new Date('2026-05-01T00:00:00.000Z'),
        }),
        now
      )
    ).toEqual({
      priority: 'urgent',
      updatedAt: now,
    });
  });

  it('preserves explicit nulls while omitting unrelated fields', () => {
    expect(
      buildTaskUpdateFieldPatch(
        { description: null, assigneeKind: 'jovie' },
        createExistingTask(),
        now
      )
    ).toEqual({
      description: null,
      assigneeKind: 'jovie',
      metadata: {
        descriptionRichTextV1: {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
      },
      updatedAt: now,
    });
  });

  it('reconciles rich metadata when a plain-text caller changes description', () => {
    expect(
      buildTaskUpdateFieldPatch(
        { description: 'Fresh plain text' },
        {
          ...createExistingTask(),
          metadata: {
            source: 'release',
            descriptionRichTextV1: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Stale rich text' }],
                },
              ],
            },
          },
        },
        now
      )
    ).toEqual({
      description: 'Fresh plain text',
      metadata: {
        source: 'release',
        descriptionRichTextV1: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Fresh plain text' }],
            },
          ],
        },
      },
      updatedAt: now,
    });
  });

  it('merges rich description content into existing metadata', () => {
    const content = {
      type: 'doc' as const,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Set list' }] },
      ],
    };

    expect(
      buildTaskUpdateFieldPatch(
        { description: 'Set list', descriptionContent: content },
        { ...createExistingTask(), metadata: { source: 'release' } },
        now
      )
    ).toEqual({
      description: 'Set list',
      metadata: { source: 'release', descriptionRichTextV1: content },
      updatedAt: now,
    });
  });

  it('sets completedAt when a task first moves to done', () => {
    expect(
      buildTaskUpdateFieldPatch({ status: 'done' }, createExistingTask(), now)
    ).toEqual({
      status: 'done',
      completedAt: now,
      updatedAt: now,
    });
  });

  it('keeps an existing completion timestamp when done is reselected', () => {
    const completedAt = new Date('2026-05-14T08:30:00.000Z');

    expect(
      buildTaskUpdateFieldPatch(
        { status: 'done' },
        createExistingTask({ status: 'done', completedAt }),
        now
      )
    ).toEqual({
      status: 'done',
      completedAt,
      updatedAt: now,
    });
  });

  it('clears completedAt when a closed task is reopened', () => {
    expect(
      buildTaskUpdateFieldPatch(
        { status: 'in_progress' },
        createExistingTask({
          status: 'done',
          completedAt: new Date('2026-05-14T08:30:00.000Z'),
        }),
        now
      )
    ).toEqual({
      status: 'in_progress',
      completedAt: null,
      updatedAt: now,
    });
  });
});
